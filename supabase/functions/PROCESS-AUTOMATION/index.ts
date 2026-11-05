import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import { PERSONA } from "./persona.ts";
import { core, isUrgent, shapeReply, guardReply, parseModel, wantsHuman } from "./rules.ts";

// helena-office-run v11 (04/11/2026) — frases fixas sem "equipe" (a equipe é a própria Dra. Suzanne); áudio que não abre não aciona a Dra.
// helena-office-run v9 (04/11/2026) — Helena mais humana (pedido da Dra. Suzanne):
//   • modelo Gemini "flash" (não mais o flash-lite) com temperatura 0.6;
//   • respostas de até 5 frases em parágrafos naturais (rules.ts), sem "no sistema";
//   • ÁUDIO: baixa da Uazapi, transcreve com o Gemini e a Helena responde ao que a pessoa falou
//     (se a transcrição falhar, volta à resposta padrão pedindo por escrito); a transcrição fica gravada na conversa;
//   • frases fixas reescritas em tom humano.
// helena-office-run v8 (02/11/2026) — motor da Helena do escritório (Manual Mestre LexOffice). v8: mídia + texto juntados seguem a última mensagem.
// Publicado no slug PROCESS-AUTOMATION (duplicata antiga e sem uso), autorizado pela Dra. Suzanne, pois o plano gratuito não permite nova função.
// Fluxo: valida chamada → pausa humana (20 min) → identifica cliente pelo telefone → carrega dados reais
// (processos/atualizações liberadas, audiências, parcelas, documentos) → orquestrador (IA) decide intenção/agente
// → servidor aplica travas (urgência real, não inventar, sem vazamento) → Helena responde → memória e decisão registradas.
// Só aciona a Dra. em urgência real (com trava de 6 h por contato). Demais providências viram item na fila da equipe (sem WhatsApp).
// Fase de teste: com whatsapp_settings.ai_enabled=false, só atende números da ai_test_allowlist.
// dry_run=true: não envia, não grava, devolve a decisão.

const OFFICE = "b3dd3ed0-2a05-4087-8220-307a44352cec";
const HUMAN_PAUSE_MIN = 20;
// v9: modelo "flash" (escreve de forma mais natural que o flash-lite). O gateway tenta outros modelos se este falhar.
const HELENA_MODEL = "gemini-3.7-flash";
const HELENA_TEMPERATURE = 0.6;
// v7: áudio/foto/documento respondidos sem IA (com tarefa para a equipe); cliente restrito liberado no portão; reclamação sem desculpas genéricas.
// v5: foto + "Helena | Concierge Jurídica" na 1ª resposta (system_runtime_secrets.helena_photo_url / helena_title).
// v4: a personalidade pode ser ajustada sem publicar código (system_runtime_secrets.helena_persona); sem ela, vale a de persona.ts.
const J = (v: any, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { "Content-Type": "application/json" } });
const D = (v: any) => String(v ?? "").replace(/\D/g, "");
const brl = (n: any) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v: any, time = false) => v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...(time ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }) } as any) : "";

async function secret(a: any, k: string) { const { data } = await a.from("system_runtime_secrets").select("secret").eq("key", k).maybeSingle(); return String(data?.secret || "").trim(); }
async function event(a: any, conversationId: string, agentKey: string, decision: string, reason: string | null, metadata: any) {
  try { await a.from("ai_orchestrator_events").insert({ org_id: OFFICE, conversation_id: conversationId, event_type: "helena_decision", agent_key: agentKey, decision, reason, metadata }); } catch (e) { console.error("event", e); }
}

// v9: transcrição de áudio (Uazapi → Gemini). Devolve "" se não conseguir.
function toBase64(buf: ArrayBuffer) { const bytes = new Uint8Array(buf); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
async function transcribeAudio(a: any, messageId: string): Promise<{ text: string; error?: string }> {
  try {
    if (!messageId) return { text: "", error: "sem_id" };
    const base = (await secret(a, "uazapi_base_url")).replace(/\/+$/, ""), token = await secret(a, "uazapi_instance_token");
    if (!/^https:\/\//.test(base) || !token) return { text: "", error: "uazapi_nao_configurada" };
    const r = await fetch(base + "/message/download", { method: "POST", headers: { token, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ id: messageId, return_base64: true, generate_mp3: true }), signal: AbortSignal.timeout(25000) });
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok) return { text: "", error: "download_" + r.status };
    let b64 = String(d?.base64Data || d?.base64 || d?.data || d?.file || "").replace(/^data:[^,]*,/, "");
    let mime = String(d?.mimetype || d?.mimeType || "audio/mpeg").split(";")[0];
    if (!b64 && (d?.fileURL || d?.fileUrl || d?.url)) {
      const f = await fetch(String(d.fileURL || d.fileUrl || d.url), { signal: AbortSignal.timeout(20000) });
      if (!f.ok) return { text: "", error: "arquivo_" + f.status };
      mime = (f.headers.get("content-type") || mime).split(";")[0];
      const buf = await f.arrayBuffer(); if (buf.byteLength > 12_000_000) return { text: "", error: "audio_grande" };
      b64 = toBase64(buf);
    }
    if (!b64) return { text: "", error: "sem_audio" };
    if (b64.length > 16_000_000) return { text: "", error: "audio_grande" };
    let key = "";
    try { const { data } = await a.rpc("read_integration_secret", { p_org_id: OFFICE, p_provider: "gemini_api" }); key = String(data || "").trim(); } catch { /* usa variável */ }
    key = key || (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_GEMINI_API_KEY") || "").trim();
    if (!key) return { text: "", error: "gemini_sem_chave" };
    for (const model of [HELENA_MODEL, "gemini-3.5-flash", "gemini-2.5-flash"]) {
      const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Transcreva fielmente este áudio de WhatsApp, em português do Brasil. Responda somente com a transcrição, sem comentários. Se não houver fala compreensível, responda apenas: [inaudível]" }, { inline_data: { mime_type: mime, data: b64 } }] }], generationConfig: { temperature: 0, maxOutputTokens: 1500 } }), signal: AbortSignal.timeout(40000) });
      const gd: any = await g.json().catch(() => null);
      if (g.ok) { const t = String(gd?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "").trim(); if (t && !/^\[?in[aá]ud[ií]vel\]?$/i.test(t)) return { text: t.slice(0, 3000) }; return { text: "", error: "inaudivel" }; }
      if (![404, 429, 500, 502, 503, 504].includes(g.status)) return { text: "", error: "gemini_" + g.status };
    }
    return { text: "", error: "gemini_indisponivel" };
  } catch (e) { return { text: "", error: "excecao:" + (e instanceof Error ? e.message : String(e)).slice(0, 80) }; }
}

async function loadClientData(a: any, clientId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [cl, ps, hs, ins, docs] = await Promise.all([
    a.from("clients").select("id,name,status,is_vip").eq("org_id", OFFICE).eq("id", clientId).maybeSingle(),
    a.from("processes").select("id,cnj_number,internal_number,area,subject,class_name,vara,comarca,status,is_partnership").eq("org_id", OFFICE).eq("client_id", clientId).neq("status", "archived").limit(8),
    a.from("process_hearings").select("title,hearing_type,starts_at,location,meeting_url,status,process_id").eq("org_id", OFFICE).eq("client_id", clientId).gte("starts_at", new Date().toISOString()).neq("status", "cancelled").order("starts_at").limit(3),
    a.from("fee_installments").select("installment_number,description,original_amount,paid_amount,due_date,status").eq("org_id", OFFICE).eq("client_id", clientId).neq("status", "paid").neq("status", "cancelled").order("due_date").limit(6),
    a.from("client_document_requests").select("title,description,status").eq("org_id", OFFICE).eq("client_id", clientId).in("status", ["pending", "requested", "open"]).limit(6),
  ]);
  const processes = (ps.data || []).filter((p: any) => p.is_partnership !== true);
  const lines: string[] = [];
  for (const p of processes) {
    const { data: mv } = await a.from("process_movements").select("movement_date,client_message,approved_for_client,is_sensitive").eq("org_id", OFFICE).eq("process_id", p.id).order("movement_date", { ascending: false }).limit(15);
    const approved = (mv || []).find((m: any) => m.approved_for_client === true && m.is_sensitive !== true && String(m.client_message || "").trim());
    const last = (mv || [])[0];
    lines.push(`• Processo ${p.cnj_number || p.internal_number || "(sem número)"} — ${[p.class_name || p.subject, p.area].filter(Boolean).join(" / ")}${p.vara ? " — " + p.vara : ""}${p.comarca ? " (" + p.comarca + ")" : ""}. Situação no cadastro: ${p.status || "-"}.` +
      (approved ? ` Atualização liberada para o cliente (${dt(approved.movement_date)}): "${String(approved.client_message).slice(0, 600)}".` : " Nenhuma atualização liberada para o cliente.") +
      (last ? ` Último registro no processo: ${dt(last.movement_date)} (conteúdo não liberado, não detalhar).` : ""));
  }
  const hearings = (hs.data || []).map((h: any) => `• ${h.title || h.hearing_type || "Audiência"} em ${dt(h.starts_at, true)}${h.location ? " — " + h.location : ""}${h.meeting_url ? " (online)" : ""}`);
  const overdue = (ins.data || []).filter((i: any) => i.due_date < today), open = (ins.data || []).filter((i: any) => i.due_date >= today);
  const fin = [
    ...overdue.map((i: any) => `• Parcela ${i.installment_number || ""} VENCIDA em ${dt(i.due_date)} — valor original ${brl(Number(i.original_amount || 0) - Number(i.paid_amount || 0))} (atualização calculada pelo escritório)`),
    ...open.slice(0, 3).map((i: any) => `• Parcela ${i.installment_number || ""} vence em ${dt(i.due_date)} — ${brl(Number(i.original_amount || 0) - Number(i.paid_amount || 0))}`),
  ];
  const docsL = (docs.data || []).map((d: any) => `• ${d.title}${d.description ? " — " + String(d.description).slice(0, 120) : ""}`);
  return {
    name: cl.data?.name || "", vip: cl.data?.is_vip === true, hasOverdue: overdue.length > 0,
    amounts: (ins.data || []).map((i: any) => Number(i.original_amount || 0) - Number(i.paid_amount || 0)),
    text: [
      `CLIENTE IDENTIFICADO pelo telefone: ${cl.data?.name || "-"}.`,
      `PROCESSOS:\n${lines.join("\n") || "• Nenhum processo ativo cadastrado."}`,
      `AUDIÊNCIAS FUTURAS CADASTRADAS:\n${hearings.join("\n") || "• Nenhuma."}`,
      `FINANCEIRO (parcelas em aberto):\n${fin.join("\n") || "• Nenhuma parcela em aberto."}`,
      `DOCUMENTOS PENDENTES:\n${docsL.join("\n") || "• Nenhum."}`,
    ].join("\n\n"),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return J({ ok: false }, 405);
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!svc || req.headers.get("authorization") !== `Bearer ${svc}`) return J({ ok: false }, 401);
  const body = await req.json().catch(() => null);
  if (!body) return J({ ok: false, error: "invalid_json" }, 400);
  if (body.org_id !== OFFICE) return J({ ok: false, error: "org_not_supported" }, 400);
  const conversationId = String(body.conversation_id || ""), phone = D(body.phone), dry = body.dry_run === true;
  let message = String(body.message || "").trim();
  const restricted = body.agent_key === "billing";
  if (!conversationId || !phone || !message) return J({ ok: false, error: "conversation_id, phone e message são obrigatórios" }, 400);
  const url = Deno.env.get("SUPABASE_URL")!;
  const a = createClient(url, svc, { auth: { persistSession: false } });
  try {
    // 1) Chave geral / fase de teste
    const { data: ws } = await a.from("whatsapp_settings").select("ai_enabled,consultation_fee_amount,alert_phone,alerts_enabled,alert_on_urgency").eq("org_id", OFFICE).maybeSingle();
    const allow = (await secret(a, "ai_test_allowlist")).split(/[,;\s]+/).map(core).filter(Boolean);
    const testNumber = allow.includes(core(phone));
    const live = (await secret(a, "helena_live")) === "true"; // v6: Helena liberada para todos sem religar cobranças/lembretes (chave geral continua desligada)
    if (!dry && ws?.ai_enabled !== true && !testNumber && !live) return J({ ok: true, skipped: "global_ai_disabled" });
    const { data: policy } = await a.from("ai_agent_policies").select("active,provider,model").eq("org_id", OFFICE).eq("agent_key", "client_service_triage").maybeSingle();
    if (!dry && policy?.active !== true) return J({ ok: true, skipped: "agent_disabled" });
    const fee = Number(ws?.consultation_fee_amount);
    if (!Number.isFinite(fee) || fee <= 0) return J({ ok: false, error: "consultation_fee_not_configured" }, 409);

    // 2) Conversa, contato, bloqueios e pausa humana
    const { data: conv } = await a.from("whatsapp_conversations").select("id,contact_id,client_id,lead_id,chatbot_context,bot_ativo,conversation_owner,human_takeover_at,human_takeover_reason,last_human_outbound_at").eq("org_id", OFFICE).eq("id", conversationId).maybeSingle();
    if (!conv) return J({ ok: false, error: "conversation_not_found" }, 404);
    const { data: ct } = await a.from("whatsapp_contacts").select("phone,client_id,lead_id,is_blocked,tags,name").eq("org_id", OFFICE).eq("id", conv.contact_id).maybeSingle();
    if (!ct || core(ct.phone) !== core(phone)) return J({ ok: false, error: "conversation_contact_mismatch" }, 400);
    const tags = (Array.isArray(ct.tags) ? ct.tags : []).map((x: any) => String(x).toLowerCase());
    if (ct.is_blocked || tags.includes("pessoal") || tags.includes("nao_responder")) return J({ ok: true, skipped: "contact_blocked" });
    const lastHuman = [conv.last_human_outbound_at, conv.human_takeover_at].filter(Boolean).map((x: any) => Date.parse(x)).filter(Number.isFinite);
    const lastHumanAt = lastHuman.length ? Math.max(...lastHuman) : 0;
    const humanActive = lastHumanAt && Date.now() - lastHumanAt < HUMAN_PAUSE_MIN * 60000;
    if (!dry && humanActive && conv.human_takeover_reason !== "ai_urgent_handoff") return J({ ok: true, skipped: "human_takeover", resume_after: new Date(lastHumanAt + HUMAN_PAUSE_MIN * 60000).toISOString() });
    if (!dry && conv.human_takeover_reason === "ai_urgent_handoff" && humanActive) return J({ ok: true, skipped: "urgent_waiting_lawyer" });
    if (!dry && (conv.bot_ativo === false || conv.conversation_owner === "HUMAN") && !humanActive) {
      const now = new Date().toISOString();
      await a.from("whatsapp_conversations").update({ bot_ativo: true, conversation_owner: "HELENA", human_takeover_at: null, human_takeover_reason: null, updated_at: now }).eq("id", conversationId);
      await a.from("ai_conversation_controls").update({ ai_enabled: true, human_takeover: false, resume_at: null, updated_at: now }).eq("org_id", OFFICE).eq("contact_key", D(ct.phone));
      await event(a, conversationId, "system", "resumed_after_human_pause", null, { minutes: HUMAN_PAUSE_MIN });
    }

    // 3) Identificação (telefone confere com cadastro ativo)
    let clientId: string | null = conv.client_id || ct.client_id || null;
    if (!clientId) {
      const { data: cs } = await a.from("clients").select("id,phone,whatsapp").eq("org_id", OFFICE).eq("status", "active").limit(3000);
      const m = (cs || []).filter((c: any) => core(c.phone) === core(phone) || core(c.whatsapp) === core(phone));
      if (m.length === 1) clientId = m[0].id;
    }
    const clientData = clientId ? await loadClientData(a, clientId) : null;

    // 4) Histórico e memória
    const { data: hist } = await a.from("whatsapp_messages").select("id,direction,body,created_at,metadata,external_message_id").eq("org_id", OFFICE).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(20);
    const lastInbound = (hist || []).find((m: any) => m.direction === "inbound");

    // v9: áudio sozinho como última mensagem → transcreve e a Helena responde ao conteúdo.
    let transcript = "", transcriptError = "";
    {
      const ls = message.split("\n").map((s) => s.trim()).filter(Boolean);
      const lastLine = ls[ls.length - 1] || "";
      if (/^\[MIDIA:áudio\]\s*$/.test(lastLine)) {
        const audioMsg = (hist || []).find((m: any) => m.direction === "inbound" && /^\[MIDIA:áudio\]\s*$/.test(String(m.body || "").trim()) && m.external_message_id);
        const tr = await transcribeAudio(a, String(body.audio_message_id || audioMsg?.external_message_id || ""));
        transcript = tr.text; transcriptError = tr.error || "";
        if (transcript) {
          ls[ls.length - 1] = `[ÁUDIO TRANSCRITO] ${transcript}`;
          message = ls.join("\n");
          if (!dry && audioMsg?.id) await a.from("whatsapp_messages").update({ body: `[MIDIA:áudio] (transcrição) ${transcript}`.slice(0, 4000) }).eq("id", audioMsg.id);
        }
      }
    }

    const history = (hist || []).slice().reverse().filter((m: any) => String(m.body || "").trim()).map((m: any) => ({ de: m.direction === "inbound" ? "cliente" : (m.metadata?.source === "ai_agent" ? "helena" : "escritorio"), texto: String(m.body).slice(0, 700), quando: dt(m.created_at, true) }));
    const first = !(hist || []).some((m: any) => m.direction === "outbound" && m.metadata?.source === "ai_agent");
    const memory = conv.chatbot_context?.helena || {};
    const nowSP = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" } as any);

    const facts = [
      `AGORA: ${nowSP}.`,
      first ? "PRIMEIRA RESPOSTA DA HELENA NESTA CONVERSA: o sistema já coloca a foto e o nome dela no topo; NÃO escreva o próprio nome nem se apresente, vá direto ao ponto." : "A Helena já se apresentou: NÃO se apresente de novo.",
      transcript ? "A ÚLTIMA MENSAGEM DO CLIENTE FOI UM ÁUDIO, já transcrito abaixo como [ÁUDIO TRANSCRITO]. Responda ao conteúdo do áudio com naturalidade, como quem ouviu; não peça para a pessoa escrever." : "",
      restricted ? "ATENDIMENTO RESTRITO: este cliente está com atendimento restrito por pendência financeira. Trate apenas da regularização do débito; para outros assuntos, diga com educação que eles serão retomados após a regularização. Alternativa de pagamento aceita: cartão de crédito. Não aceite promessa de nova data." : "",
      clientData ? clientData.text : "PESSOA NÃO IDENTIFICADA: o telefone não confere com nenhum cliente ativo. Não revele dados de processos, finanças ou pessoas. Se disser que é cliente, peça o nome completo para localizar o cadastro (needs_team=true).",
      `MEMÓRIA DA CONVERSA: ${JSON.stringify(memory).slice(0, 1500)}`,
    ].filter(Boolean).join("\n\n");

    // v7: mídia (áudio, foto, documento, vídeo) — resposta determinística, sem IA.
    // v8: a junção de mensagens pode misturar mídia e texto; a resposta segue a ÚLTIMA mensagem do cliente.
    const markerRe = /\[MIDIA:([^\]]+)\]/g;
    const kinds = [...message.matchAll(markerRe)].map((x) => x[1]);
    const realKinds = kinds.filter((k) => k !== "figurinha");
    const plainText = message.replace(markerRe, "").trim();
    if (kinds.length && !realKinds.length && !plainText) return J({ ok: true, skipped: "sticker" });
    const kindPt = (k: string) => k === "áudio" ? "um áudio" : k === "imagem" ? "uma imagem" : k === "vídeo" ? "um vídeo" : "um documento";
    const aiMessage = message.replace(/\[MIDIA:figurinha\]/g, "").replace(markerRe, (_: string, k: string) => `(o cliente enviou ${kindPt(k)})`).replace(/\n{2,}/g, "\n").trim();
    const lines = message.split("\n").map((s) => s.trim()).filter(Boolean);
    const mediaM = (lines[lines.length - 1] || "").match(/^\[MIDIA:([^\]]+)\]\s*([\s\S]*)$/);
    let mediaReply = "", mediaKind = "", mediaCaption = "";
    const docEarlier = (!mediaM || mediaM[1] === "figurinha") && realKinds.some((k) => k !== "áudio");
    if (mediaM && mediaM[1] !== "figurinha") {
      mediaKind = mediaM[1]; const caption = mediaM[2].trim(); mediaCaption = plainText;
      if (mediaKind === "áudio" && !plainText) {
        const askedBefore = (hist || []).some((m: any) => m.direction === "outbound" && m.metadata?.source === "ai_agent" && /áudio/i.test(String(m.body || "")) && Date.now() - Date.parse(m.created_at) < 6 * 3600000);
        mediaReply = askedBefore ? "Esse áudio também não abriu direito por aqui.\n\nSe puder, me escreve o principal que eu já te ajudo?" : "Recebi seu áudio, mas não consegui ouvir direito por aqui.\n\nConsegue me escrever em poucas palavras o que precisa?";
      } else if (mediaKind !== "áudio") {
        mediaReply = mediaKind === "documento" || mediaKind === "imagem"
          ? `Recebi ${mediaKind === "documento" ? "o documento" : "a imagem"}${caption ? " e a sua mensagem" : ""}, obrigada.\n\nJá fica guardado aqui junto com o seu atendimento. Se faltar alguma coisa, te aviso por aqui.`
          : "Recebi o arquivo, obrigada.\n\nJá fica guardado aqui junto com o seu atendimento. Se faltar alguma coisa, te aviso por aqui.";
      }
    }

    // 5) Orquestrador + Helena (IA)
    let model: any = null, providerError = "";
    if (!mediaReply) try {
      const r = await fetch(`${url}/functions/v1/ai-provider-gateway`, { method: "POST", headers: { Authorization: `Bearer ${svc}`, apikey: svc, "Content-Type": "application/json" }, body: JSON.stringify({ org_id: OFFICE, conversation_id: conversationId, agent_key: "helena_office_engine", purpose: "whatsapp_reply_helena", provider: "gemini", model: HELENA_MODEL, temperature: HELENA_TEMPERATURE, instructions: ((await secret(a, "helena_persona")) || PERSONA).replaceAll("VALOR_CONSULTA", brl(fee)) + "\n\nDADOS DO SISTEMA (autoritativos):\n" + facts, input: JSON.stringify({ historico: history, mensagem_atual: aiMessage }) }), signal: AbortSignal.timeout(45000) });
      const d = await r.json().catch(() => null);
      if (!r.ok || d?.ok !== true) providerError = `gateway_${r.status}:${String(d?.error || "").slice(0, 120)}`; else model = parseModel(String(d.text || ""));
      if (!providerError && !model) providerError = "invalid_model_json";
    } catch (e) { providerError = "gateway_exception:" + (e instanceof Error ? e.message : String(e)).slice(0, 120); }

    const urgentText = isUrgent(aiMessage);
    let urgent = urgentText || (model?.urgent === true && model?.intent === "urgencia" && isUrgent(aiMessage + " " + String(model?.team_note || "")));
    let reply = "", agent = String(model?.agent || "triagem"), intent = String(model?.intent || (urgent ? "urgencia" : "outro"));
    let needsTeam = model?.needs_team === true, teamNote = String(model?.team_note || "").slice(0, 900);
    if (docEarlier && !urgent) { needsTeam = true; teamNote = (teamNote ? teamNote + " | " : "") + `Cliente também enviou ${realKinds.filter((k) => k !== "áudio").join(", ")} pelo WhatsApp. Conferir na conversa.`; }

    if (mediaReply && !urgent) {
      reply = mediaReply; intent = mediaKind === "áudio" ? "outro" : "documentos"; agent = mediaKind === "áudio" ? "triagem" : "documentos";
      needsTeam = mediaKind !== "áudio"; teamNote = `Cliente enviou ${mediaKind} pelo WhatsApp${mediaCaption ? " com o texto: " + mediaCaption.slice(0, 300) : ""}. Conferir na conversa.`;
    } else if (urgent) {
      reply = shapeReply(model?.reply && model?.intent === "urgencia" ? guardReply(model.reply, { fee, amounts: [], identified: !!clientData }) : "") ||
        "Sua mensagem foi registrada com prioridade para a Dra. Suzanne.\n\nSe houver risco imediato à vida ou à integridade física, ligue 190; o 180 também orienta mulheres em situação de violência.";
      agent = "triagem"; intent = "urgencia";
    } else if (!model) {
      // Falha da IA: resposta segura, no máximo uma vez por hora por conversa.
      const { data: recentFallback } = await a.from("ai_orchestrator_events").select("id").eq("conversation_id", conversationId).eq("decision", "fallback_reply").gte("created_at", new Date(Date.now() - 3600000).toISOString()).limit(1).maybeSingle();
      if (recentFallback) { if (!dry) await event(a, conversationId, "system", "provider_failed_silent", providerError, {}); return J({ ok: false, error: "provider_unavailable", detail: providerError }, 502); }
      reply = "Recebi sua mensagem e já deixei anotado.\n\nJá já te respondo por aqui.";
      needsTeam = true; teamNote = `Helena sem IA disponível (${providerError}). Mensagem do cliente: ${message.slice(0, 500)}`; intent = "outro"; agent = "triagem";
      if (!dry) await event(a, conversationId, "system", "fallback_reply", providerError, {});
    } else {
      reply = shapeReply(guardReply(String(model.reply || ""), { fee, amounts: clientData?.amounts || [], identified: !!clientData }));
      // v7: sem pedido de desculpas genérico em reclamação (Manual: firme e objetiva).
      if (intent === "reclamacao") { const kept = reply.split("\n\n").filter((x) => !/^(sinto muito|pe[cç]o desculpas|lamento|desculpe)/i.test(x.trim())); if (kept.length) reply = kept.join("\n\n"); }
      if (!reply) return J({ ok: false, error: "reply_blocked_by_guard", model_reply: dry ? model.reply : undefined }, 502);
    }
    reply = reply.replace(/^\*?Helena\*?(?:\s*\|[^\n]*)?,?( da equipe da Dra\.? Suzanne\.?)?\s*/i, "").trim() || reply;
    const title = (await secret(a, "helena_title")) || "Helena | Concierge Jurídica";
    const photo = first ? (await secret(a, "helena_photo_url")) : "";
    if (first) reply = `*${title}*\n\n` + reply;

    const decision = { intent, agent, urgent, needs_team: needsTeam, team_note: teamNote, identified: !!clientData, test_number: testNumber, first, provider_error: providerError || undefined, wants_human: wantsHuman(message), audio_transcribed: transcript ? true : undefined, transcript: dry && transcript ? transcript : undefined, transcript_error: transcriptError || undefined };
    if (dry) return J({ ok: true, dry_run: true, reply, decision, memory: model?.memory || null });

    // 6) Envio
    const idem = `helena-office:${conversationId}:${lastInbound?.id || message.slice(0, 40)}`;
    // v6: chave de envio própria, para a trava geral da IA (que segura cobranças e lembretes) não bloquear a Helena.
    const gateAgent = (await secret(a, "helena_gate_agent_key")) || "client_service_triage";
    const gate = (extra: any, key: string) => fetch(`${url}/functions/v1/whatsapp-outbound-gate`, { method: "POST", headers: { Authorization: `Bearer ${svc}`, apikey: svc, "Content-Type": "application/json" }, body: JSON.stringify({ org_id: OFFICE, conversation_id: conversationId, phone, agent_key: gateAgent, message: reply, triage_reply: true, first_interaction: first, format_agent_reply: true, restricted_mode: restricted, idempotency_key: key, human_silence_minutes: HUMAN_PAUSE_MIN, delay_seconds: urgent ? 0 : 5, ...extra }) });
    // v5: 1ª resposta vai com a foto da Helena e o nome na legenda; se a imagem falhar, manda só o texto.
    let send = await gate(photo ? { image: photo, caption: reply } : {}, idem);
    let sd = await send.json().catch(() => null);
    if (photo && !(send.ok && sd?.allowed === true) && !String(sd?.reason || "").match(/human|disabled|restriction|unsafe/)) { send = await gate({}, idem + ":texto"); sd = await send.json().catch(() => null); }
    const sent = send.ok && sd?.allowed === true;

    // 7) Efeitos: urgência (alerta com trava de 6 h), fila da equipe, memória, registro
    let alerted = false;
    if (urgent && ws?.alerts_enabled !== false && D(ws?.alert_phone)) {
      const { data: recent } = await a.from("ai_agent_alerts").select("id").eq("org_id", OFFICE).eq("contact_phone", phone).eq("agent_key", "client_service_triage").gte("created_at", new Date(Date.now() - 6 * 3600000).toISOString()).limit(1).maybeSingle();
      if (!recent) {
        const who = clientData?.name || ct.name || phone;
        const summary = String(model?.memory?.summary || message).slice(0, 400);
        const msg = `LEXOFFICE | 🔴 URGENTE\n\n👤 *${who.toUpperCase()}*\n📌 *Resumo:* ${summary}\n📱 ${phone}\n\nResponda com sua orientação ou assuma a conversa pelo celular.`;
        const { data: row } = await a.from("ai_agent_alerts").insert({ org_id: OFFICE, agent_key: "client_service_triage", client_id: clientId, contact_phone: phone, alert_phone: D(ws.alert_phone), reason: "Urgência relatada no atendimento", context: `Resumo: ${summary}`, status: "pending" }).select("id").single();
        try { const rr = await fetch(url + "/functions/v1/whatsapp-operator-send", { method: "POST", headers: { Authorization: "Bearer " + svc, "Content-Type": "application/json" }, body: JSON.stringify({ org_id: OFFICE, message: msg, targets: [{ phone: D(ws.alert_phone), name: "LEXOFFICE" }] }) }); const od = await rr.json().catch(() => null); alerted = rr.ok && Number(od?.sent || 0) > 0; if (row?.id) await a.from("ai_agent_alerts").update(alerted ? { status: "sent", sent_at: new Date().toISOString() } : { status: "failed", error_message: String(od?.error || rr.status).slice(0, 300) }).eq("id", row.id); } catch (e) { console.error("alert", e); }
      }
      const now = new Date().toISOString();
      await a.from("whatsapp_conversations").update({ priority: "urgent", human_takeover_at: now, human_takeover_reason: "ai_urgent_handoff", updated_at: now }).eq("id", conversationId);
    }
    if (needsTeam && !urgent) {
      const { data: dup } = await a.from("human_review_queue").select("id").eq("org_id", OFFICE).eq("source_type", "helena_team_task").eq("source_id", conversationId).eq("status", "pending").gte("created_at", new Date(Date.now() - 2 * 3600000).toISOString()).limit(1).maybeSingle();
      if (!dup) await a.from("human_review_queue").insert({ org_id: OFFICE, client_id: clientId, source_type: "helena_team_task", source_id: conversationId, title: `Helena: ${intent.replace(/_/g, " ")} — ${clientData?.name || ct.name || phone}`, content: message.slice(0, 1500), ai_suggestion: teamNote || null, priority: "normal", status: "pending", metadata: { phone, intent, agent } });
    }
    const newMemory = { ...(memory || {}), ...(model?.memory || {}), facts: { ...(memory?.facts || {}), ...(model?.memory?.facts || {}) }, last_intent: intent, last_agent: agent, identified_client_id: clientId, updated_at: new Date().toISOString() };
    await a.from("whatsapp_conversations").update({ chatbot_context: { ...(conv.chatbot_context || {}), helena: newMemory }, owner_agent_key: "client_service_triage", ...(clientId && !conv.client_id ? { client_id: clientId } : {}), updated_at: new Date().toISOString() }).eq("id", conversationId);
    await event(a, conversationId, "client_service_triage", sent ? "replied" : "reply_blocked", sent ? null : String(sd?.reason || sd?.error || send.status), { ...decision, alerted });
    return J({ ok: true, sent, gate_reason: sd?.reason, reply, decision: { ...decision, alerted } });
  } catch (e) {
    console.error("helena-office-run", e instanceof Error ? e.message : e);
    return J({ ok: false, error: "helena_failed" }, 500);
  }
});
