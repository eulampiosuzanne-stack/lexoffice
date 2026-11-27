import { buildList, readChoice, extension, confirmation } from "./docinbox.mjs";

const OWNER = "0e98483f-a464-422b-bf3e-68f454cdd405";
const BUCKET = "lexoffice-documents"; // mesmo lugar da aba Documentos

const pendingRequests = async (db: any, org: string, clientId: string) => {
  const { data, error } = await db.from("client_document_requests").select("id,title,process_id").eq("org_id", org).eq("client_id", clientId).eq("status", "pending").order("created_at").order("title");
  if (error) throw new Error("requests: " + error.message);
  return data || [];
};

async function uaz(db: any, path: string, body: unknown) {
  const secret = async (k: string) => String((await db.from("system_runtime_secrets").select("secret").eq("key", k).maybeSingle()).data?.secret || "").trim();
  const base = (await secret("uazapi_base_url")).replace(/\/+$/, ""), token = await secret("uazapi_instance_token");
  if (!/^https:\/\//.test(base) || !token) return false;
  const r = await fetch(base + path, { method: "POST", headers: { token, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  if (!r.ok) console.error("uazapi", path, r.status);
  return r.ok;
}

// Grava como automação: não pausa a Helena nem conta como resposta humana.
const record = (db: any, org: string, conv: string, text: string, ok: boolean) =>
  db.from("whatsapp_messages").insert({ org_id: org, conversation_id: conv, direction: "outbound", message_type: "text", body: text, status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null, metadata: { source: "chatbot", sender_type: "automation", flow: "document-inbox" } });

async function findClient(db: any, org: string, phone: string, variants: string[], pushName: string) {
  const { data: contacts } = await db.from("whatsapp_contacts").select("id,client_id").eq("org_id", org).in("phone", variants).limit(10);
  let contact = (contacts || []).find((c: any) => c.client_id) || contacts?.[0] || null;
  let conv: any = null;
  if (contact) conv = (await db.from("whatsapp_conversations").select("id,client_id").eq("org_id", org).eq("contact_id", contact.id).neq("status", "closed").order("updated_at", { ascending: false }).limit(1).maybeSingle()).data;
  const clientId = contact?.client_id || conv?.client_id || (await db.rpc("lex_client_by_phone", { p_org: org, p_phone: phone })).data || null;
  if (!clientId) return null;
  if (!contact) contact = (await db.from("whatsapp_contacts").insert({ org_id: org, phone, name: pushName || null, client_id: clientId }).select("id").single()).data;
  if (contact && !conv) conv = (await db.from("whatsapp_conversations").insert({ org_id: org, contact_id: contact.id, client_id: clientId, status: "open", bot_ativo: true, conversation_owner: "HELENA" }).select("id").single()).data;
  return conv ? { clientId, convId: conv.id as string } : null;
}

// Guarda o arquivo e mostra a lista. Devolve null quando não há pedido pendente (segue o caminho normal).
export async function receiveRequestedFile(db: any, a: { org: string; phone: string; variants: string[]; pushName: string; url: string; mid: string; filename: string; mime: string; label: string }) {
  const found = await findClient(db, a.org, a.phone, a.variants, a.pushName);
  if (!found) return null;
  const pending = await pendingRequests(db, a.org, found.clientId);
  if (!pending.length) return null;
  const dup = await db.from("whatsapp_document_inbox").select("id").eq("source_message_id", a.mid).maybeSingle();
  if (dup.data) return { duplicate: true };
  const res = await fetch(a.url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error("file_" + res.status);
  const mime = [res.headers.get("content-type"), a.mime].map((v) => String(v || "").split(";")[0].trim()).find((v) => v && v !== "application/octet-stream") || (a.label === "imagem" ? "image/jpeg" : "application/pdf");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("file_size");
  const ext = extension(a.filename, mime);
  const path = `${a.org}/whatsapp/${found.clientId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) throw new Error("upload: " + up.error.message);
  // Já entra em Documentos: se o cliente não marcar, o arquivo não se perde.
  const doc = await db.from("documents").insert({ org_id: a.org, client_id: found.clientId, name: `WhatsApp - ${a.filename || `arquivo.${ext}`}`, file_path: path, mime_type: mime, size_bytes: bytes.length, category: "client_upload", notes: "Recebido pelo WhatsApp, sem identificação", uploaded_by: OWNER, owner_user_id: OWNER }).select("id").single();
  if (doc.error) { await db.storage.from(BUCKET).remove([path]); throw new Error("document: " + doc.error.message); }
  const row = await db.from("whatsapp_document_inbox").insert({ org_id: a.org, client_id: found.clientId, conversation_id: found.convId, source_message_id: a.mid, document_id: doc.data.id, storage_path: path, filename: a.filename || `arquivo.${ext}`, mime, size_bytes: bytes.length }).select("id").single();
  if (row.error) throw new Error("inbox: " + row.error.message);
  await db.from("whatsapp_messages").insert({ org_id: a.org, conversation_id: found.convId, direction: "inbound", message_type: "text", body: `[Arquivo recebido: ${a.label}] guardado, aguardando o cliente dizer qual documento é`, external_message_id: a.mid, status: "received", metadata: { source: "document_inbox" } });
  const list = buildList(pending);
  const claim = await db.rpc("lex_claim_document_list", { p_inbox: row.data.id, p_options: list.options });
  if (claim.data !== true) return { stored: true, list: "already_sent" };
  let ok = await uaz(db, "/send/menu", { number: a.phone, type: "list", text: list.body, listButton: "Escolher documento", choices: ["[Documentos pedidos]", ...list.rows.map((r: any) => `${r.title}|${r.id}|${r.description}`)] });
  if (!ok) ok = await uaz(db, "/send/text", { number: a.phone, text: list.asText });
  await record(db, a.org, found.convId, list.asText, ok);
  return { stored: true, list: ok ? "sent" : "failed" };
}

// O cliente marcou: liga os arquivos ao pedido, dá baixa e confirma.
export async function chooseDocument(db: any, messageId: string) {
  const { data: m } = await db.from("whatsapp_messages").select("id,org_id,conversation_id,direction,body,metadata,created_at").eq("id", messageId).maybeSingle();
  if (!m || m.direction !== "inbound" || Date.now() - new Date(m.created_at).getTime() > 5 * 60000) return { ignored: "message" };
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  // Trava: um segundo toque não encontra mais nada em "waiting".
  const { data: files } = await db.from("whatsapp_document_inbox").update({ status: "processing" }).eq("conversation_id", m.conversation_id).eq("status", "waiting").gt("created_at", since).select("*");
  const { data: cv } = await db.from("whatsapp_conversations").select("contact_id").eq("id", m.conversation_id).maybeSingle();
  const { data: ct } = await db.from("whatsapp_contacts").select("name,phone").eq("id", cv?.contact_id).maybeSingle();
  const phone = String(ct?.phone || "").replace(/\D/g, "");
  const say = async (text: string) => { const ok = phone ? await uaz(db, "/send/text", { number: phone, text }) : false; await record(db, m.org_id, m.conversation_id, text, ok); return ok; };
  if (!files?.length) { await say("Não encontrei arquivo aguardando. Envie o documento novamente, por favor. 😊"); return { ignored: "no_files" }; }
  const back = () => db.from("whatsapp_document_inbox").update({ status: "waiting" }).in("id", files.map((f: any) => f.id)).eq("status", "processing");
  try {
    files.sort((x: any, y: any) => x.created_at.localeCompare(y.created_at));
    const options = files.filter((f: any) => f.options).sort((x: any, y: any) => String(y.list_sent_at).localeCompare(String(x.list_sent_at)))[0]?.options || [];
    const choice = readChoice(m.metadata?.selected_row_id, m.body, options);
    const clientId = files[0].client_id;
    const pending = await pendingRequests(db, m.org_id, clientId);
    const request = pending.find((r: any) => r.id === choice) || null;
    if (!choice || (choice !== "other" && !request)) {
      await back();
      await say("Não consegui identificar a opção. Escolha um item da lista ou responda com o número. 😊");
      return { ignored: "invalid_choice" };
    }
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (request) {
        const name = `${request.title}${files.length > 1 ? ` (${i + 1})` : ""}.${extension(f.filename, f.mime)}`;
        const doc = await db.from("documents").update({ name, process_id: request.process_id || null, notes: "Recebido pelo WhatsApp" }).eq("id", f.document_id);
        if (doc.error) throw new Error("document: " + doc.error.message);
      }
      await db.from("whatsapp_document_inbox").update({ status: request ? "linked" : "other", request_id: request?.id || null }).eq("id", f.id);
    }
    if (request) {
      const upd = await db.from("client_document_requests").update({ status: "received", document_id: files[0].document_id, updated_at: new Date().toISOString() }).eq("id", request.id).eq("status", "pending");
      if (upd.error) throw new Error("request: " + upd.error.message);
    }
    await db.from("notifications").insert({ org_id: m.org_id, user_id: OWNER, type: "service", title: "Documento recebido pelo WhatsApp", body: `${ct?.name || phone}: ${request?.title || "outro documento (fora do pedido)"}`, link: "/documentos" });
    await say(confirmation(request?.title || "", pending.filter((r: any) => r.id !== request?.id).map((r: any) => r.title)));
    return { linked: files.length, request: request?.id || "other" };
  } catch (e) {
    await back();
    await say("Tive um problema para guardar o documento. A equipe vai conferir por aqui. 🙏");
    throw e;
  }
}
