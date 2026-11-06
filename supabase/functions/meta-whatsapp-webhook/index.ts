import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import { AsyncLocalStorage } from "node:async_hooks";
import { D, TXT, MENU, AREA, NODE_MENU, normalizeId, pickByNumber, isAck, isMenuWord, wantsCall, serviceHours, firstName, samePhone } from "./rules.ts";

// meta-whatsapp-webhook v42 (05/11/2026) — canal Meta desconectado de propósito (o escritório usa só a Uazapi/Hub):
//   sem conexão Meta ativa, o evento é ignorado com HTTP 200 (antes dava 500 "org" e a Meta repetia o envio sem parar).
//   Nada é gravado nem respondido nesse caso; o restante do fluxo é idêntico à v41.
// meta-whatsapp-webhook v41 (02/11/2026) — FASE DE TESTE COM UAZAPI: quando whatsapp_provider=uazapi, mensagens e ecos
//   dos números da ai_test_allowlist são ignorados aqui (a LEX antiga os recebe pela Uazapi). Assim a resposta da Helena,
//   que volta como "eco" da coexistência, não pausa mais a Helena como se fosse a Dra. digitando. Demais números: sem mudança.
// meta-whatsapp-webhook v37 (14/10/2026) — EVOLUTION É O CANAL PRINCIPAL (pedido da Dra. Suzanne).
// - Enquanto a instância Evolution "suzanne-lexoffice" estiver conectada, este webhook NÃO grava nem processa nada
//   (antes cada mensagem aparecia duas vezes e respostas da IA da Meta pausavam os agentes como se fosse a Dra.).
// - Se a Evolution cair, volta a gravar as mensagens recebidas (reserva), para nada se perder.
// - Para forçar a escuta da Meta mesmo com a Evolution ligada: system_runtime_secrets.meta_listen_when_evolution_up = 'true'.
// v29 (08/10/2026) — Chatbot oficial (Meta Cloud API) aprovado pela Dra. Suzanne.
// - Texto com emojis, SEM imagem; botões (máx. 3, até 20 caracteres) e lista (até 10 itens, até 24 caracteres).
// - SEM IA conversando: só menu e respostas prontas. Nada promete ligação nem "falar com a Dra.".
// - Só chegam à Dra. (WhatsApp de alerta): urgência fora do horário com taxa aceita e cliente VIP.
// - Demais pedidos viram notificação no LEXOFFICE (sino), com prazo de retorno de 1 dia útil para o cliente.
// - Liga/desliga: system_runtime_secrets.meta_chatbot_enabled = 'true'. Sem isso, só grava as mensagens.
// - Quando a Dra. responde pelo celular (eco da coexistência), o robô para naquela conversa por 60 min.
// - Teste sem enviar nada: cabeçalho x-lex-dry-run: 1 (com a mesma chave do webhook); x-lex-test-now simula o horário.
// Origem das mensagens do robô começa com "meta_menu_": o gatilho do banco (hard_stop_ai) reconhece como automática e NÃO marca atendimento humano.

const j = (x: any, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { "Content-Type": "application/json" } });
const GV = "v21.0";
const HUMAN_PAUSE_MIN = 20;
const MENU_REPEAT_MIN = 3;
const DONE_SILENCE_H = 12;

type Run = { dry: boolean; out: any[]; now?: Date };
const RUN = new AsyncLocalStorage<Run>();
const run = (): Run => RUN.getStore() || { dry: false, out: [] };
const nowDate = () => run().now || new Date();

function db() { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }); }
async function secret(s: any, key: string) { const { data } = await s.from("system_runtime_secrets").select("secret").eq("key", key).maybeSingle(); return String(data?.secret || "").trim(); }
async function org(s: any) {
  const forced = (Deno.env.get("LEXOFFICE_ORG_ID") || "").trim(); if (forced) return forced;
  const { data } = await s.from("integration_connections").select("org_id").in("provider", ["meta_whatsapp", "whatsapp_meta"]).eq("status", "connected");
  if (data && data.length === 1) return data[0].org_id; throw new Error("org");
}
async function ownerOf(s: any, o: string) {
  const { data } = await s.from("profiles").select("id").eq("org_id", o).in("role_key", ["owner", "admin"]).eq("status", "active").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.id || null;
}
// v37: Evolution conectada = canal principal; Meta fica só de reserva.
async function evolutionPrimary(s: any, o: string) {
  // Quando a configuração oficial é Meta, ela é sempre o canal principal.
  const provider = (await secret(s, "whatsapp_provider")).toLowerCase();
  if (provider === "meta" || provider === "meta_whatsapp" || provider === "whatsapp_meta") return false;
  if ((await secret(s, "meta_listen_when_evolution_up")) === "true") return false;
  const { data } = await s.from("whatsapp_evolution_instances").select("status,is_active").eq("org_id", o).eq("instance_name", "suzanne-lexoffice").maybeSingle();
  return data?.status === "connected" && data?.is_active === true;
}
// v41: números de teste atendidos pela Uazapi (não processar aqui).
async function uazapiTestNumber(s: any, value: any) {
  if ((await secret(s, "whatsapp_provider")).toLowerCase() !== "uazapi") return false;
  const allow = (await secret(s, "ai_test_allowlist")).split(/[,;\s]+/).map(D).filter(Boolean);
  if (!allow.length) return false;
  const phones = [...(value?.messages || []).map((m: any) => m?.from), ...(value?.message_echoes || []).map((e: any) => e?.to)].map(D).filter(Boolean);
  return phones.length > 0 && phones.every((p: string) => allow.some((x: string) => samePhone(x, p)));
}

// ---------- envio (com modo de teste) ----------
async function metaCfg(s: any) { const token = await secret(s, "meta_system_user_token"), phoneId = await secret(s, "meta_whatsapp_phone_number_id"); if (!token || !phoneId) throw new Error("Meta Cloud API não configurada"); return { token, phoneId }; }
async function graphSend(s: any, payload: any) {
  const r0 = run(); if (r0.dry) { r0.out.push(payload); return { messages: [{ id: "dry_" + crypto.randomUUID() }] }; }
  const { token, phoneId } = await metaCfg(s);
  const r = await fetch(`https://graph.facebook.com/${GV}/${phoneId}/messages`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", ...payload }) });
  const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error?.message || "Falha Meta"); return d;
}
async function store(s: any, o: string, cv: any, eid: string | null, text: string, out: boolean, source: string, metadata: any = {}, type = "text") {
  const { error } = await s.from("whatsapp_messages").insert({ org_id: o, conversation_id: cv.id, owner_user_id: cv.owner_user_id, external_message_id: eid, direction: out ? "outbound" : "inbound", message_type: type, body: text, status: out ? "sent" : "received", sent_at: out ? new Date().toISOString() : null, metadata: { source, fromMe: out, dry_run: run().dry || undefined, ...metadata } });
  if (error && String(error.code) !== "23505") throw error; return !error;
}
async function sendText(s: any, o: string, cv: any, to: string, body: string, source: string) {
  const d = await graphSend(s, { to, type: "text", text: { body, preview_url: false } });
  await store(s, o, cv, String(d?.messages?.[0]?.id || "") || null, body, true, source);
}
// ---------- Helena orquestrada: uma única voz, especialistas internos em rotação ----------
function metaIntent(text: string, isClient: boolean) {
  const t = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/process|andamento|audiencia|sentenca|decisao|juiz|liminar|movimenta|intima|citacao|prazo/.test(t)) return "client_process_updates";
  if (/pag|parcela|boleto|\bpix\b|cobranca|debito|honorario|atras|comprovante|cartao/.test(t)) return "billing";
  if (/agend|reuniao|consulta|horario|remarc|atendimento presencial/.test(t)) return "client_schedule_relationship";
  if (!isClient && /(contrat|proposta|valor da acao|quanto custa|parcelar|entrada|desconto|vou pensar|ta caro|muito caro)/.test(t)) return "sales";
  return "client_service_triage";
}
async function runHelenaMeta(s: any, o: string, cv: any, from: string, text: string) {
  const isClient = !!cv?.client_id;
  const agentKey = metaIntent(text, isClient);
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/helena-conversation-run", {
    method: "POST",
    headers: { Authorization: "Bearer " + svc, apikey: svc, "Content-Type": "application/json" },
    body: JSON.stringify({ org_id: o, conversation_id: cv.id, phone: D(from), agent_key: agentKey, interaction_mode: "orchestrated", message: text })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false) throw new Error(data?.error || "Falha ao executar Helena");
  return { agent_key: agentKey, result: data };
}

async function recentMenu(s: any, cv: any, menu: string) {
  const since = new Date(Date.now() - MENU_REPEAT_MIN * 60000).toISOString();
  const { data } = await s.from("whatsapp_messages").select("id").eq("conversation_id", cv.id).eq("direction", "outbound").eq("metadata->>source", "meta_menu_menu").eq("metadata->>menu", menu).gte("created_at", since).limit(1).maybeSingle();
  return !!data;
}
async function sendMenu(s: any, o: string, cv: any, to: string, menu: string, body: string, items: any[], kind: "button" | "list", force = true) {
  if (!force && await recentMenu(s, cv, menu)) return { skipped: true };
  const action = kind === "button"
    ? { buttons: items.slice(0, 3).map((x) => ({ type: "reply", reply: { id: x.id, title: x.title } })) }
    : { button: "Ver opções", sections: [{ title: "Opções", rows: items.slice(0, 10).map((x) => ({ id: x.id, title: x.title, ...(x.description ? { description: x.description } : {}) })) }] };
  try {
    const d = await graphSend(s, { to, type: "interactive", interactive: { type: kind, body: { text: body }, action } });
    await store(s, o, cv, String(d?.messages?.[0]?.id || "") || null, body, true, "meta_menu_menu", { menu, menu_type: kind, button_ids: items.map((x) => x.id) }, "interactive");
    return { fallback: false };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const fallback = body + "\n\n" + items.map((x, i) => `${i + 1}️⃣ ${x.title}`).join("\n") + "\n\n_Responda com o número da opção._";
    await logEvent(s, o, "meta_interactive_send_failed", { conversation_id: cv.id, menu }, err);
    await sendText(s, o, cv, to, fallback, "meta_menu_numbered_fallback");
    return { fallback: true, error: err };
  }
}
async function logEvent(s: any, o: string, kind: string, payload: any, error: string) {
  try { const ow = await ownerOf(s, o); if (ow) await s.from("whatsapp_events").insert({ org_id: o, event_type: kind, payload, processed: false, error_message: error || null, owner_user_id: ow }); } catch (e) { console.error("META_EVENT_LOG_FAILED", e); }
}

// ---------- estado da conversa ----------
async function context(s: any, o: string, raw: string, name: string | null) {
  const ph = D(raw), ownerId = await ownerOf(s, o); if (!ownerId) throw new Error("org_owner_missing");
  let { data: ct } = await s.from("whatsapp_contacts").select("*").eq("org_id", o).eq("phone", ph).limit(1).maybeSingle();
  if (!ct) { const r = await s.from("whatsapp_contacts").insert({ org_id: o, phone: ph, whatsapp_id: raw, name, profile_name: name, owner_user_id: ownerId }).select("*").single(); ct = r.data; }
  let { data: cv } = await s.from("whatsapp_conversations").select("*").eq("org_id", o).eq("contact_id", ct.id).neq("status", "closed").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!cv) { const r = await s.from("whatsapp_conversations").insert({ org_id: o, contact_id: ct.id, status: "open", priority: "normal", bot_ativo: true, conversation_owner: "HELENA", owner_user_id: ownerId }).select("*").single(); cv = r.data; }
  let { data: c } = await s.from("ai_conversation_controls").select("*").eq("org_id", o).eq("contact_key", ph).maybeSingle();
  if (!c) { const r = await s.from("ai_conversation_controls").insert({ org_id: o, contact_key: ph, ai_enabled: true, human_takeover: false, resume_after_minutes: 0, resume_at: null, owner_user_id: ownerId }).select("*").single(); c = r.data; }
  return { cv, c, ct, ph };
}
async function pauseForHuman(s: any, cv: any, c: any, reason: string) {
  const n = new Date(), now = n.toISOString(), resume = new Date(n.getTime() + HUMAN_PAUSE_MIN * 60000).toISOString();
  await s.from("whatsapp_conversations").update({ bot_ativo: false, human_takeover_at: now, human_takeover_reason: reason, conversation_owner: "HUMAN", owner_agent_key: null, owner_changed_at: now, last_human_outbound_at: now, updated_at: now }).eq("id", cv.id);
  if (c?.id) await s.from("ai_conversation_controls").update({ ai_enabled: false, human_takeover: true, human_takeover_at: now, last_human_message_at: now, resume_after_minutes: HUMAN_PAUSE_MIN, resume_at: resume, updated_at: now }).eq("id", c.id);
}
// Robô pode falar? (não fala se a Dra./equipe assumiu; volta sozinho depois do prazo de pausa)
async function botAllowed(s: any, o: string, cvId: string, ph: string) {
  let { data: v } = await s.from("whatsapp_conversations").select("bot_ativo,human_takeover_at,conversation_owner").eq("id", cvId).maybeSingle();
  let { data: c } = await s.from("ai_conversation_controls").select("id,ai_enabled,human_takeover,resume_at").eq("org_id", o).eq("contact_key", ph).maybeSingle();
  if (c?.human_takeover === true && c?.resume_at && new Date(c.resume_at).getTime() <= Date.now()) {
    const now = new Date().toISOString();
    await s.from("ai_conversation_controls").update({ ai_enabled: true, human_takeover: false, human_takeover_at: null, resume_after_minutes: 0, resume_at: null, updated_at: now }).eq("id", c.id);
    await s.from("whatsapp_conversations").update({ bot_ativo: true, human_takeover_at: null, human_takeover_reason: null, conversation_owner: "HELENA", owner_changed_at: now, updated_at: now }).eq("id", cvId);
    v = { ...v, bot_ativo: true, human_takeover_at: null, conversation_owner: "HELENA" }; c = { ...c, ai_enabled: true, human_takeover: false };
  }
  return v?.bot_ativo === true && v?.conversation_owner !== "HUMAN" && !v?.human_takeover_at && c?.ai_enabled !== false && c?.human_takeover !== true;
}
async function getFlow(s: any, cv: any) { const { data } = await s.from("whatsapp_chatbot_flow_state").select("current_node,path,updated_at").eq("conversation_id", cv.id).maybeSingle(); return String(data?.current_node || "").startsWith("meta_") ? data : null; }
async function setFlow(s: any, o: string, cv: any, node: string, path: any = {}) { await s.from("whatsapp_chatbot_flow_state").upsert({ conversation_id: cv.id, org_id: o, current_node: "meta_" + node, path: { ...path, channel: "meta_whatsapp" }, updated_at: new Date().toISOString() }, { onConflict: "conversation_id" }); }
async function done(s: any, o: string, cv: any, path: any = {}) { await setFlow(s, o, cv, "done", { ...path, done_at: new Date().toISOString() }); }

// ---------- avisos ----------
async function notifyLex(s: any, o: string, title: string, body: string) {
  if (run().dry) { run().out.push({ notify_lex: title, body: String(body).slice(0, 300) }); return; }
  try { const { data: users } = await s.from("profiles").select("id").eq("org_id", o).in("role_key", ["owner", "admin"]).eq("status", "active").limit(10); if (users?.length) await s.from("notifications").insert(users.map((u: any) => ({ org_id: o, user_id: u.id, type: "service", title, body: String(body).slice(0, 900), link: "/atendimento", read: false }))); } catch (e) { console.error("notifyLex", e); }
}
// Alerta imediato no WhatsApp da Dra. (só urgência e VIP). Envia na hora pelo portão de saída; registra em ai_agent_alerts.
async function alertDra(s: any, o: string, from: string, reason: string, contextText: string) {
  const { data: st } = await s.from("whatsapp_settings").select("alert_phone").eq("org_id", o).maybeSingle();
  const alertPhone = D(st?.alert_phone); if (!alertPhone) { await logEvent(s, o, "meta_alert_missing_destination", { reason, from }, "Sem telefone de alerta"); return false; }
  const msg = `🚨 LEXOFFICE • ${reason}\nContato: ${D(from)}\n${String(contextText || "").slice(0, 700)}`;
  if (run().dry) { run().out.push({ alert_to: alertPhone, text: msg }); }
  else {
    try { const u = Deno.env.get("SUPABASE_URL")!, sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; await fetch(u + "/functions/v1/whatsapp-outbound-gate", { method: "POST", headers: { Authorization: "Bearer " + sk, apikey: sk, "Content-Type": "application/json" }, body: JSON.stringify({ org_id: o, phone: alertPhone, message: msg, agent_key: "system", operator_send: true, idempotency_key: "metabot-alert:" + D(from) + ":" + reason + ":" + new Date().toISOString().slice(0, 16) }) }); } catch (e) { console.error("alertDra", e); }
  }
  if (!run().dry) try { await s.from("ai_agent_alerts").insert({ org_id: o, agent_key: "helena", contact_phone: D(from), alert_phone: alertPhone, reason, context: String(contextText || "").slice(0, 1800), status: "sent", sent_at: new Date().toISOString() }); } catch (e) { console.error("alert row", e); }
  return true;
}

// ---------- cadastro ----------
async function clientMatches(s: any, o: string, ph: string) {
  const { data } = await s.from("clients").select("id,name,phone,whatsapp,is_vip,status").eq("org_id", o).eq("status", "active").limit(2000);
  return (data || []).filter((x: any) => samePhone(x.phone, ph) || samePhone(x.whatsapp, ph));
}
async function lastApproved(s: any, o: string, clientId: string) {
  const { data: ps } = await s.from("processes").select("id,cnj_number,internal_number").eq("org_id", o).eq("client_id", clientId).eq("status", "active").limit(3);
  if ((ps || []).length !== 1) return null;
  const { data: m } = await s.from("process_movements").select("movement_date,client_message").eq("org_id", o).eq("process_id", ps![0].id).eq("approved_for_client", true).eq("is_sensitive", false).not("client_message", "is", null).order("movement_date", { ascending: false }).limit(1).maybeSingle();
  if (!m?.client_message) return null;
  return { cnj: String(ps![0].cnj_number || ps![0].internal_number || ""), date: new Date(m.movement_date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), msg: String(m.client_message).slice(0, 900) };
}
async function saveLead(s: any, o: string, cv: any, from: string, path: any, description: string, profileName: string | null) {
  const owner = await ownerOf(s, o); if (!owner) throw new Error("org_owner_missing");
  const { data: rows } = await s.from("leads").select("id,phone,whatsapp,notes").eq("org_id", o).limit(2000);
  const p = D(from), old = (rows || []).find((x: any) => samePhone(x.phone, from) || samePhone(x.whatsapp, from));
  const notes = "Área: " + String(path?.area || "Não informada") + "\nResumo: " + description;
  let id = old?.id || null, err: any = null;
  if (old?.id) { const r = await s.from("leads").update({ name: String(path?.name || profileName || "Contato WhatsApp"), notes: [old.notes, notes].filter(Boolean).join("\n\n"), updated_at: new Date().toISOString() }).eq("id", old.id); err = r.error; }
  else { const r = await s.from("leads").insert({ org_id: o, owner_user_id: owner, name: String(path?.name || profileName || "Contato WhatsApp"), phone: p, whatsapp: p, origin: "whatsapp_meta", stage_key: "novo_lead", notes, is_demo: run().dry ? true : false }).select("id").single(); id = r.data?.id || null; err = r.error; }
  if (err) throw err;
  if (id) await s.from("whatsapp_conversations").update({ lead_id: id }).eq("id", cv.id);
  return { id, duplicate: !!old };
}

// ---------- fluxo ----------
async function mainMenu(s: any, o: string, cv: any, to: string, force = true) { await setFlow(s, o, cv, "root", {}); return sendMenu(s, o, cv, to, "root", TXT.welcome, MENU.root, "button", force); }
async function clientMenu(s: any, o: string, cv: any, to: string, client: any) { await setFlow(s, o, cv, "client_menu", { client_id: client?.id || null, client_name: client?.name || "" }); return sendMenu(s, o, cv, to, "client", TXT.client(firstName(client?.name)), MENU.client, "list"); }
async function draMenu(s: any, o: string, cv: any, to: string, path: any) { await setFlow(s, o, cv, "dra_menu", path); return sendMenu(s, o, cv, to, "dra", TXT.draPrompt, MENU.dra, "list"); }
async function afterHoursMenu(s: any, o: string, cv: any, to: string, force = true) { await setFlow(s, o, cv, "afterhours_menu", {}); return sendMenu(s, o, cv, to, "after", TXT.afterHours, MENU.after, "button", force); }

async function choose(s: any, o: string, cv: any, c: any, from: string, id: string, flow: any, profileName: string | null, text: string): Promise<string> {
  const path = flow?.path || {};
  switch (id) {
    case "menu_main": await mainMenu(s, o, cv, from); return "main_menu";
    case "m1_sou_cliente": {
      const found = await clientMatches(s, o, from);
      if (found.length === 1) { await clientMenu(s, o, cv, from, found[0]); return "client_menu"; }
      await setFlow(s, o, cv, "client_lookup", {}); await sendText(s, o, cv, from, TXT.lookup, "meta_menu_lookup"); return "client_lookup";
    }
    case "m1_nao_sou_cliente": await setFlow(s, o, cv, "lead_area", {}); await sendMenu(s, o, cv, from, "areas", TXT.areas, MENU.areas, "list"); return "lead_area";
    case "m1_outros": await setFlow(s, o, cv, "other_summary", {}); await sendText(s, o, cv, from, TXT.other, "meta_menu_other"); return "other_summary";
    case "client_last_movement": {
      let clientId = path.client_id; if (!clientId) { const f = await clientMatches(s, o, from); if (f.length === 1) clientId = f[0].id; }
      const ap = clientId ? await lastApproved(s, o, clientId) : null;
      await sendText(s, o, cv, from, ap ? TXT.processApproved(ap.cnj, ap.date, ap.msg) : TXT.processGeneric, ap ? "meta_menu_last_movement" : "meta_menu_process_generic");
      await done(s, o, cv, { client_id: clientId || null }); return ap ? "process_approved" : "process_generic";
    }
    case "client_documents": await setFlow(s, o, cv, "client_docs", { client_id: path.client_id || null, client_name: path.client_name || "" }); await sendText(s, o, cv, from, TXT.docs, "meta_menu_docs"); return "client_docs";
    case "menu_client": { const found = await clientMatches(s, o, from); if (found.length === 1) await clientMenu(s, o, cv, from, found[0]); else await mainMenu(s, o, cv, from); return "client_menu"; }
    case "client_urgent": await setFlow(s, o, cv, "urgent_description", path); await sendText(s, o, cv, from, TXT.urgentPrompt, "meta_menu_urgent_prompt"); return "urgent_description";
    case "client_dra": await draMenu(s, o, cv, from, path); return "dra_menu";
    case "dra_schedule": await sendText(s, o, cv, from, TXT.draSchedule, "meta_menu_dra_schedule"); await notifyLex(s, o, "Pedido de reunião com Dra. Suzanne", `${path.client_name || profileName || D(from)} solicitou reunião entre 13h e 18h. Conferir agenda antes de ofertar horário.`); await done(s, o, cv, path); return "dra_schedule";
    case "dra_message": await setFlow(s, o, cv, "dra_message", path); await sendText(s, o, cv, from, TXT.draMessage, "meta_menu_dra_message"); return "dra_message";
    case "client_fees": await sendText(s, o, cv, from, TXT.fees, "meta_menu_fees"); await notifyLex(s, o, "Cliente pediu posição financeira (WhatsApp)", `${path.client_name || profileName || D(from)} pediu a posição financeira atualizada. Retornar em até 1 dia útil.`); await done(s, o, cv, path); return "fees";
    case "lead_schedule": await sendText(s, o, cv, from, TXT.leadSchedule, "meta_menu_lead_schedule"); await notifyLex(s, o, "Novo lead quer agendar consulta (WhatsApp)", `${path.name || profileName || D(from)} • Área: ${path.area || "-"} • ${String(path.description || "").slice(0, 400)}. Enviar horários em até 1 dia útil.`); await done(s, o, cv, path); return "lead_schedule";
    case "lead_wait": await sendText(s, o, cv, from, TXT.leadWait, "meta_menu_lead_wait"); await notifyLex(s, o, "Novo lead aguardando contato (WhatsApp)", `${path.name || profileName || D(from)} • Área: ${path.area || "-"} • ${String(path.description || "").slice(0, 400)}. Retornar em até 1 dia útil.`); await done(s, o, cv, path); return "lead_wait";
    case "afterhours_next": await sendText(s, o, cv, from, TXT.afterNext, "meta_menu_after_next"); await notifyLex(s, o, "Retorno no próximo dia útil (WhatsApp)", `${profileName || D(from)} escreveu fora do horário e pediu retorno no próximo dia útil.`); await done(s, o, cv, {}); return "after_next";
    case "afterhours_urgent": {
      await alertDra(s, o, from, "URGENTE FORA DO HORÁRIO (taxa aceita)", `${profileName || ""} aceitou a taxa adicional e marcou como urgente. Última mensagem: ${text || "-"}`);
      await sendText(s, o, cv, from, TXT.afterUrgent, "meta_menu_after_urgent"); await pauseForHuman(s, cv, c, "urgent_after_hours"); await done(s, o, cv, {}); return "after_urgent";
    }
  }
  if (AREA[id]) { await setFlow(s, o, cv, "lead_name", { area: AREA[id] }); await sendText(s, o, cv, from, TXT.leadName, "meta_menu_lead_name"); return "lead_name"; }
  return "";
}

async function freeText(s: any, o: string, cv: any, c: any, from: string, text: string, flow: any, profileName: string | null, media: any): Promise<string> {
  const node = String(flow?.current_node || ""), path = flow?.path || {};
  if (node === "meta_urgent_description") { if (text.trim().length < 5 && !media) return "urgent_waiting_detail"; const detail = text.trim() || (media ? `[${media.label}]` : "Urgência informada"); const sent = await alertDra(s, o, from, "CLIENTE SOLICITOU URGÊNCIA", `${path.client_name || profileName || D(from)}: ${detail.slice(0, 650)}`); await notifyLex(s, o, "URGÊNCIA: cliente solicita Dra. Suzanne", `${path.client_name || profileName || D(from)}: ${detail.slice(0, 650)}`); await sendText(s, o, cv, from, sent ? "🚨 Estamos acionando a Dra. Suzanne para comunicar sua urgência." : "🚨 Sua solicitação foi registrada para análise prioritária.", "meta_menu_urgent_ack"); await pauseForHuman(s, cv, c, "client_urgency"); await done(s, o, cv, path); return "urgent_forwarded"; }
  if (node === "meta_dra_message") { if (text.trim().length < 3 && !media) return "message_waiting_detail"; await notifyLex(s, o, "Recado para Dra. Suzanne", `${path.client_name || profileName || D(from)}: ${(text.trim() || `[${media?.label}]`).slice(0, 700)}`); await sendText(s, o, cv, from, "Seu recado foi registrado para apreciação da Dra. Suzanne.", "meta_menu_dra_message_received"); await done(s, o, cv, path); return "dra_message_received"; }
  if (node === "meta_client_docs" && media) { await sendText(s, o, cv, from, TXT.docsReceived, "meta_menu_docs_received"); await notifyLex(s, o, "Documento recebido pelo WhatsApp", `${path.client_name || profileName || D(from)} enviou: ${media.label}. Confirmar recebimento em até 1 dia útil.`); await done(s, o, cv, path); return "doc_received"; }
  if (media) return node === "meta_done" ? "silent_media" : "";
  if (node === "meta_lead_name") { if (text.trim().length < 3) { await sendText(s, o, cv, from, TXT.leadNameRetry, "meta_menu_retry"); return "retry"; } await setFlow(s, o, cv, "lead_description", { ...path, name: text.trim().slice(0, 120) }); await sendText(s, o, cv, from, TXT.leadDesc, "meta_menu_lead_desc"); return "lead_description"; }
  if (node === "meta_lead_description") {
    const desc = text.trim(); if (desc.length < 4) { await sendText(s, o, cv, from, TXT.leadDescRetry, "meta_menu_retry"); return "retry"; }
    const existing = await clientMatches(s, o, from);
    if (existing.length) { await sendText(s, o, cv, from, TXT.leadIsClient, "meta_menu_lead_is_client"); await notifyLex(s, o, "Cliente usou a opção 'Não sou cliente'", `${existing[0].name} • Área: ${path.area || "-"} • ${desc.slice(0, 400)}`); await clientMenu(s, o, cv, from, existing[0]); return "lead_is_client"; }
    try { await saveLead(s, o, cv, from, path, desc, profileName); }
    catch (e) { console.error("saveLead", e); await notifyLex(s, o, "Falha ao registrar lead do WhatsApp", `${path.name || D(from)} • ${path.area || "-"} • ${desc.slice(0, 400)}`); }
    await setFlow(s, o, cv, "lead_next", { ...path, description: desc.slice(0, 600) });
    await sendMenu(s, o, cv, from, "lead_next", TXT.leadNext(firstName(path.name)), MENU.leadNext, "button"); return "lead_saved";
  }
  if (node === "meta_other_summary") { if (text.trim().length < 3) { await sendText(s, o, cv, from, TXT.otherRetry, "meta_menu_retry"); return "retry"; } await sendText(s, o, cv, from, TXT.received, "meta_menu_received"); await notifyLex(s, o, "Novo assunto pelo WhatsApp (Outros)", `${profileName || D(from)}: ${text.trim().slice(0, 700)}`); await done(s, o, cv, {}); return "other_received"; }
  if (node === "meta_client_lookup") { await sendText(s, o, cv, from, TXT.lookupNotFound, "meta_menu_lookup_done"); await notifyLex(s, o, "Conferir cadastro (WhatsApp)", `${profileName || D(from)} disse ser cliente, mas o telefone não foi localizado. Dados enviados: ${text.trim().slice(0, 500)}`); await done(s, o, cv, {}); return "lookup_registered"; }
  return "";
}

async function handle(s: any, o: string, msg: any, value: any, enabled: boolean) {
  const fromRaw = String(msg?.from || "").trim(); if (!fromRaw) return { ignored: "no_from" };
  const eid = typeof msg?.id === "string" ? msg.id : null, profileName = (value.contacts || [])[0]?.profile?.name || null;
  const { cv, c, ct, ph } = await context(s, o, fromRaw, profileName);
  const interactiveId = normalizeId(String(msg?.interactive?.button_reply?.id || msg?.interactive?.list_reply?.id || msg?.button?.payload || ""));
  let text = "", media: any = null;
  if (msg?.type === "text") text = String(msg?.text?.body || "").trim();
  else if (msg?.type === "interactive") text = String(msg?.interactive?.button_reply?.title || msg?.interactive?.list_reply?.title || "").trim();
  else if (msg?.type === "button") text = String(msg?.button?.text || "").trim();
  else if (["document", "image", "video", "audio", "sticker"].includes(msg?.type)) { const m = msg[msg.type] || {}; media = { type: msg.type, id: m.id || null, mime: m.mime_type || null, label: m.filename || ({ document: "documento", image: "imagem", video: "vídeo", audio: "áudio", sticker: "figurinha" } as any)[msg.type] }; text = String(m.caption || "").trim(); }
  const fresh = await store(s, o, cv, eid, media ? `[${media.label} recebido]${text ? "\n" + text : ""}` : text, false, "meta_cloud_api", media ? { media } : {}, media ? media.type : "text");
  if (!fresh) return { ignored: "duplicate" };
  if (!enabled) return { action: "stored_bot_disabled" };
  if (!(await botAllowed(s, o, cv.id, ph))) return { action: "stored_human_active" };

  // HELENA: áudios são registrados, mas não respondem à triagem.
  if (media?.type === "audio") {
    const { data: previousNotices, error: noticeError } = await s.from("whatsapp_messages").select("id").eq("org_id", o).eq("conversation_id", cv.id).eq("direction", "outbound").in("metadata->>source", ["meta_menu_audio_notice_1", "meta_menu_audio_notice_2"]).limit(2);
    if (noticeError) { console.error("audio_notice_lookup", noticeError); return { action: "audio_registered_notice_check_failed" }; }
    const noticeCount = previousNotices?.length || 0;
    if (noticeCount === 0) {
      await sendText(s, o, cv, fromRaw, "Prezado(a), recebi sua mensagem de áudio.\n\n" + "Para assegurar a precisão das informações, solicitamos que encaminhe sua mensagem por escrito. " + "Os áudios são analisados somente ao final do expediente.\n\n" + "Em caso de urgência, descreva a situação por texto.", "meta_menu_audio_notice_1");
    } else if (noticeCount === 1) {
      await sendText(s, o, cv, fromRaw, "Reiteramos que as mensagens de áudio são verificadas somente ao final do expediente.\n\n" + "Para darmos continuidade ao atendimento, escreva sua solicitação. " + "Caso exista urgência, informe a situação por texto.", "meta_menu_audio_notice_2");
    }
    return { action: noticeCount < 2 ? "audio_notice_" + (noticeCount + 1) : "audio_registered_no_repeat" };
  }

  if (!media && !interactiveId && isAck(text)) return { action: "ignored_short_ack" };

  // VIP: sem menu, direto para a Dra.
  const matches = await clientMatches(s, o, fromRaw);
  if (matches.length === 1 && !cv.client_id) {
    await s.from("whatsapp_conversations").update({ client_id: matches[0].id, updated_at: new Date().toISOString() }).eq("id", cv.id);
    cv.client_id = matches[0].id;
  }
  if (matches.length === 1 && matches[0].is_vip) {
    await alertDra(s, o, fromRaw, "CLIENTE VIP no WhatsApp", `${matches[0].name}: ${text || (media ? "[" + media.label + "]" : "")}`);
    await sendText(s, o, cv, fromRaw, TXT.vip(firstName(matches[0].name)), "meta_menu_vip");
    await pauseForHuman(s, cv, c, "vip_whatsapp_handoff"); return { action: "vip_handoff" };
  }

  // Texto livre segue para o orquestrador. Menus nativos continuam disponíveis quando escolhidos.
  if (!media && !interactiveId && text.trim() && !isMenuWord(text)) {
    try {
      const routed = await runHelenaMeta(s, o, cv, fromRaw, text.trim());
      return { action: "helena_orchestrated", agent_key: routed.agent_key };
    } catch (e) {
      console.error("meta_helena_orchestrated", e);
      await notifyLex(s, o, "Falha temporária no atendimento Helena", (profileName || D(fromRaw)) + ": " + text.slice(0, 500));
      return { action: "helena_failed_registered" };
    }
  }

  let flow = await getFlow(s, cv);
  const node = String(flow?.current_node || "");
  const doneRecently = node === "meta_done" && flow?.path?.done_at && Date.now() - new Date(flow.path.done_at).getTime() < DONE_SILENCE_H * 3600000;
  const id = interactiveId || pickByNumber(node, text);

  if (id) { const r = await choose(s, o, cv, c, fromRaw, id, flow, profileName, text); if (r) return { action: r }; }
  if (interactiveId) { await mainMenu(s, o, cv, fromRaw); return { action: "unknown_id_main_menu" }; }
  if (isMenuWord(text)) { await mainMenu(s, o, cv, fromRaw); return { action: "main_menu" }; }

  const hours = serviceHours(nowDate());
  const r2 = await freeText(s, o, cv, c, fromRaw, text, flow, profileName, media); if (r2) return { action: r2 };

  if (doneRecently) return { action: "stored_after_done" };
  if (!media && wantsCall(text)) { await sendText(s, o, cv, fromRaw, TXT.call, "meta_menu_call"); await notifyLex(s, o, "Pedido de ligação (WhatsApp)", `${profileName || D(fromRaw)}: ${text.slice(0, 500)}`); await done(s, o, cv, {}); return { action: "call_registered" }; }
  if (!hours.inHours) { const r = await afterHoursMenu(s, o, cv, fromRaw, node !== "meta_afterhours_menu"); return { action: r.skipped ? "after_hours_repeat_skipped" : "after_hours_menu" }; }
  if (NODE_MENU[node]) {
    const menuName = ({ meta_root: "root", meta_client_menu: "client", meta_dra_menu: "dra", meta_lead_area: "areas", meta_lead_next: "lead_next", meta_afterhours_menu: "after" } as any)[node];
    if (await recentMenu(s, cv, menuName)) return { action: "menu_repeat_skipped" };
    if (node === "meta_root") { await mainMenu(s, o, cv, fromRaw); return { action: "main_menu" }; }
    if (node === "meta_dra_menu") { await draMenu(s, o, cv, fromRaw, flow?.path || {}); return { action: "dra_menu" }; }
    if (node === "meta_client_menu") { await clientMenu(s, o, cv, fromRaw, { id: flow?.path?.client_id, name: flow?.path?.client_name }); return { action: "client_menu" }; }
    if (node === "meta_lead_area") { await sendMenu(s, o, cv, fromRaw, "areas", TXT.chooseOption, MENU.areas, "list"); return { action: "lead_area" }; }
    if (node === "meta_lead_next") { await sendMenu(s, o, cv, fromRaw, "lead_next", TXT.chooseOption, MENU.leadNext, "button"); return { action: "lead_next" }; }
    if (node === "meta_afterhours_menu") { await afterHoursMenu(s, o, cv, fromRaw); return { action: "after_hours_menu" }; }
  }
  const r = await mainMenu(s, o, cv, fromRaw, false); return { action: r.skipped ? "menu_repeat_skipped" : "main_menu" };
}

// Mensagens que a Dra./equipe enviam pelo celular (coexistência): param o robô naquela conversa.
async function handleEchoes(s: any, o: string, value: any) {
  let n = 0;
  for (const e of value?.message_echoes || []) {
    const to = String(e?.to || "").trim(); if (!to) continue;
    const { cv, c } = await context(s, o, to, null);
    const body = e?.type === "text" ? String(e?.text?.body || "").trim() : `[mensagem enviada pelo celular: ${e?.type || "mídia"}]`;
    const fresh = await store(s, o, cv, typeof e?.id === "string" ? e.id : null, body, true, "meta_human_echo");
    if (fresh) { await pauseForHuman(s, cv, c, "operator_phone_message"); n++; }
  }
  return n;
}

Deno.serve(async (req) => {
  const u = new URL(req.url), s = db();
  if (req.method === "GET") { const e = await secret(s, "meta_webhook_secret"); if (u.searchParams.get("hub.mode") === "subscribe" && e && u.searchParams.get("hub.verify_token") === e) return new Response(u.searchParams.get("hub.challenge") || ""); return j({ ok: false }, 403); }
  if (req.method !== "POST") return j({ ok: false }, 405);
  // Meta sends signed POST events without an arbitrary URL query key.
  // Preserve the legacy key for trusted internal callers, otherwise require Meta's HMAC signature.
  const legacyKey = await secret(s, "meta_webhook_secret");
  const legacyAuthorized = !!legacyKey && u.searchParams.get("key") === legacyKey;
  if (!legacyAuthorized) {
    const appSecret = await secret(s, "meta_app_secret");
    const provided = req.headers.get("x-hub-signature-256") || "";
    if (!appSecret || !/^sha256=[a-f0-9]{64}$/i.test(provided)) return j({ ok: false }, 401);
    const rawBody = await req.clone().arrayBuffer();
    const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expectedBytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, rawBody));
    const expected = "sha256=" + Array.from(expectedBytes, b => b.toString(16).padStart(2, "0")).join("");
    let diff = 0;
    const supplied = provided.toLowerCase();
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
    if (diff !== 0) return j({ ok: false }, 401);
  }
  const dry = req.headers.get("x-lex-dry-run") === "1";
  const tn = dry ? new Date(req.headers.get("x-lex-test-now") || "") : null;
  return await RUN.run({ dry, out: [], now: tn && !isNaN(tn.getTime()) ? tn : undefined }, async () => {
    try {
      const body = await req.json().catch(() => null), change = body?.entry?.[0]?.changes?.[0], value = change?.value;
      if (!value) return j({ ok: true, ignored: "no_value" });
      // v42: sem conexão Meta ativa (desconectada de propósito), ignora com 200 em vez de falhar com 500.
      let o: string;
      try { o = await org(s); } catch { return j({ ok: true, ignored: "meta_not_connected", dry_run: dry }); }
      const myId = await secret(s, "meta_whatsapp_phone_number_id");
      if (String(value?.metadata?.phone_number_id || "") !== myId) return j({ ok: true, ignored: "other_number" });
      // v37: com a Evolution conectada, a Meta não grava nem processa (evita mensagens duplicadas e pausas falsas).
      if (await evolutionPrimary(s, o)) return j({ ok: true, ignored: "evolution_primary", dry_run: dry });
      // v41: número de teste atendido pela Uazapi — não grava nem pausa aqui.
      if (await uazapiTestNumber(s, value)) return j({ ok: true, ignored: "uazapi_test_number", dry_run: dry });
      if (change?.field === "smb_message_echoes" || value?.message_echoes?.length) { const n = await handleEchoes(s, o, value); return j({ ok: true, action: "human_echo_pause", count: n, dry_run: dry }); }
      if (!value.messages?.length) return j({ ok: true, ignored: "status_or_no_message" });
      const enabled = dry || (await secret(s, "meta_chatbot_enabled")) === "true";
      const result = await handle(s, o, value.messages[0], value, enabled);
      return j({ ok: true, ...result, dry_run: dry, outbound: dry ? run().out : undefined });
    } catch (x) { console.error(x); return j({ ok: false, error: x instanceof Error ? x.message : String(x) }, 500); }
  });
});
