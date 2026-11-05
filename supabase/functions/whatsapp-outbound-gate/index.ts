import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import { panelTakeover } from "../_shared/panel-takeover.ts";
import {
  formatWhatsAppAgentReply,
  previewForLog,
} from "./_shared/whatsapp-reply-format.mjs";
// v71 — (02/11/2026) mídia recebida pela Uazapi chega à Helena como "[MIDIA:áudio|imagem|documento|vídeo|figurinha] legenda";
//        Helena (helena_office) pode responder cliente com restrição financeira quando restricted_mode=true (sem falar de valores).
// v66 — WEBHOOK UAZAPI embutido (?uazapi_webhook=1&token=...), pois o plano não permite nova função.
// v66 — PROVEDOR UAZAPI (24/10/2026): com system_runtime_secrets.whatsapp_provider=uazapi, os envios saem pela
//        instância paga painelsf-escritorio (painelsf.uazapi.com). Todas as travas abaixo continuam iguais.
//        Evolution permanece como alternativa (whatsapp_provider=evolution).
// v44 — CHAVE GERAL DA IA (08/10/2026): com whatsapp_settings.ai_enabled=false, nenhuma RESPOSTA automática
//        a mensagem de cliente sai (resposta = cliente escreveu nos últimos 30 min). Avisos proativos
//        (cobrança, lembretes, andamentos, assinatura) e alertas para a Dra. continuam saindo.
// v39 — sem assinatura "Helena | Suzanne Figueiredo Advocacia" no topo (pedido da Dra. Suzanne, 29/09/2026). Mantém uma frase por parágrafo.
// v36 — cada frase em um parágrafo separado por linha em branco.
// v35 — respostas dos agentes com uma linha em branco entre parágrafos.
// v34 — grava resposta no histórico.
// v33 — credenciais Z-API: usa as mesmas do menu (banco) antes das variáveis antigas.
// v32 — assinatura, tempo de silêncio após atendimento humano e atraso de digitação
// passam a vir da configuração do agente (enviados pelo helena-conversation-run).
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const digits = (v: any) => String(v ?? "").replace(/\D/g, "");
const OFFICE_ORG = "b3dd3ed0-2a05-4087-8220-307a44352cec";
const AGENT_KEYS = new Set([
  "client_service_triage",
  "client_process_updates",
  "client_schedule_relationship",
  "sales",
  "billing",
  "helena_chatbot",
]);
const DEFAULT_COOLDOWN_MIN = 20;
function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
async function runtimeSecret(a: any, key: string) {
  try {
    const { data } = await a.from("system_runtime_secrets").select("secret").eq("key", key).maybeSingle();
    return String(data?.secret || "").trim();
  } catch {
    return "";
  }
}
async function activeProvider(_a: any) { return "evolution"; }
async function evolutionSend(a:any,orgId:string,phone:string,message:string,delaySeconds=0,typing=false,image:string|null=null,caption:string|null=null,document:string|null=null,fileName:string|null=null){
 const base=(await runtimeSecret(a,"evolution_api_url")).replace(/\/+$/,"");
 const key=await runtimeSecret(a,"evolution_api_key");
 const instance=(await runtimeSecret(a,"evolution_instance_name"))||"suzanne-lexoffice",p=digits(phone);
 if(orgId!==OFFICE_ORG)throw new Error("Provedor Evolution não autorizado nesta organização");
 if(!/^https:\/\//.test(base)||!key||!p)throw new Error("Evolution não configurada ou número inválido");
 const {data:instanceRow,error:instanceError}=await a.from("whatsapp_evolution_instances").select("status,is_active").eq("org_id",orgId).eq("instance_name",instance).maybeSingle();
 if(instanceError||instanceRow?.status!=="connected"||instanceRow?.is_active!==true)throw new Error("Instância Evolution não está ativa");
 const media=document||image;
 const endpoint=media?"message/sendMedia":"message/sendText";
 const payload=document
   ?{number:p,mediatype:"document",media:document,fileName:fileName||"documento.pdf",caption:caption||message||""}
   :image
     ?{number:p,mediatype:"image",media:image,caption:caption||message||""}
     :{number:p,text:message,delay:Math.max(0,Math.min(15000,Math.round(Number(delaySeconds)||0)*1000))};
 const response=await fetch(base+"/"+endpoint+"/"+encodeURIComponent(instance),{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(16000)});
 const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{data={raw:raw.slice(0,240)}}
 if(!response.ok)throw new Error("Evolution "+response.status+": "+String(data?.message||data?.error||raw||"falha").slice(0,280));
 return data;
}
function sanitize(text: string) {
  return text.replace(/^\s*(suporte|support)\s*:\s*/i, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function unsafe(text: string) {
  return /(bot_ativo|human_takeover|ai_enabled|resume_at|system prompt|prompt interno|racioc[ií]nio interno|verifica[cç][aã]o de estado|transbordo humano|registro de poss[ií]vel)/i.test(text);
}
// Chave geral: a IA está desligada e isto é uma RESPOSTA a cliente (não um aviso proativo nem alerta interno)?
async function aiKillSwitch(a: any, orgId: string, conversationId: string | null, target: string, agentKey: string) {
  if (!AGENT_KEYS.has(agentKey) && agentKey !== "system") return false;
  const { data: ws } = await a.from("whatsapp_settings").select("ai_enabled,alert_phone,commercial_alert_phone").eq("org_id", orgId).maybeSingle();
  if (ws?.ai_enabled !== false) return false;
  if(orgId===OFFICE_ORG){const allowed=(await runtimeSecret(a,"ai_test_allowlist")).split(/[,;\s]+/).map(digits).filter(Boolean);if(allowed.includes(digits(target)))return false;}
  const p = digits(target);
  const adminPhones = [ws?.alert_phone, ws?.commercial_alert_phone].map(digits).filter(Boolean);
  if (adminPhones.some((x: string) => x === p)) return false; // somente os numeros administrativos exatos
  let convId = conversationId;
  if (!convId && p) {
    const { data: ct } = await a.from("whatsapp_contacts").select("id").eq("org_id", orgId).eq("phone", p).limit(1).maybeSingle();
    if (ct) { const { data: cv } = await a.from("whatsapp_conversations").select("id").eq("org_id", orgId).eq("contact_id", ct.id).neq("status", "closed").order("updated_at", { ascending: false }).limit(1).maybeSingle(); convId = cv?.id || null; }
  }
  if (!convId) return true; // sem conversa validada, IA globalmente desligada
  const since = new Date(Date.now() - 30 * 60000).toISOString();
  const { count } = await a.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("conversation_id", convId).eq("direction", "inbound").gte("created_at", since);
  return (count || 0) > 0;
}
async function conversationState(a: any, orgId: string, conversationId: string | null, target: string, cooldownMs: number) {
  let cv: any = null;
  const cols = "id,bot_ativo,conversation_owner,human_takeover_at,human_takeover_reason,last_human_outbound_at,chatbot_context";
  if (conversationId) {
    const q = await a.from("whatsapp_conversations").select(cols).eq("org_id", orgId).eq("id", conversationId).maybeSingle();
    cv = q.data;
  } else {
    const p = digits(target);
    if (p) {
      const { data: ct } = await a.from("whatsapp_contacts").select("id").eq("org_id", orgId).eq("phone", p).limit(1).maybeSingle();
      if (ct) {
        const q = await a.from("whatsapp_conversations").select(cols).eq("org_id", orgId).eq("contact_id", ct.id).neq("status", "closed").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        cv = q.data;
      }
    }
  }
  const panel = cv ? await panelTakeover(a, cv) : { managed: false };
  if (panel.managed) { cv.bot_ativo = !panel.paused; cv.conversation_owner = panel.paused ? "HUMAN" : "HELENA"; }
  const p = digits(target);
  let ctl: any = null;
  if (p) {
    const q = await a.from("ai_conversation_controls").select("ai_enabled,human_takeover,last_human_message_at,resume_at").eq("org_id", orgId).eq("contact_key", p).maybeSingle();
    ctl = q.data;
  }
  const timestamps = [cv?.last_human_outbound_at, ctl?.last_human_message_at]
    .filter(Boolean).map((x: any) => new Date(x).getTime()).filter(Number.isFinite);
  const lastHumanAt = timestamps.length ? Math.max(...timestamps) : null,
    cooldownUntil = lastHumanAt ? lastHumanAt + cooldownMs : null,
    humanCooldownActive = Boolean(cooldownUntil && Date.now() < cooldownUntil);
  const emergencyOnly = cv?.human_takeover_reason === "emergency_manual_takeover_fix" && !lastHumanAt;
  return {
    cv, ctl,
    panel_managed: panel.managed,
    global_ai_enabled: panel.global_ai_enabled,
    bot_ativo: cv?.bot_ativo ?? null,
    human_takeover: panel.managed ? panel.paused : !emergencyOnly && Boolean(cv?.conversation_owner === "HUMAN" || cv?.human_takeover_at || ctl?.human_takeover === true || ctl?.ai_enabled === false),
    last_human_outbound_at: lastHumanAt ? new Date(lastHumanAt).toISOString() : null,
    cooldown_until: panel.managed ? panel.resume_at : cooldownUntil ? new Date(cooldownUntil).toISOString() : null,
    human_cooldown_active: panel.managed ? panel.paused : humanCooldownActive,
  };
}
async function blockedByHuman(a: any, orgId: string, conversationId: string | null, target: string, automated: boolean, cooldownMs: number, panelAutomated = automated) {
  const state = await conversationState(a, orgId, conversationId, target, cooldownMs);
  if (!automated && !(state.panel_managed && panelAutomated)) return { blocked: false, reason: "human_operator_allowed", state };
  if (state.panel_managed) return { blocked: state.human_takeover, reason: "human_takeover", state };
  if (state.human_cooldown_active) return { blocked: true, reason: `human_cooldown_${Math.round(cooldownMs/60000)}m`, state };
  const manualTakeover = state.cv?.human_takeover_reason === "manual_operator_message" && Boolean(state.last_human_outbound_at);
  if (manualTakeover) return { blocked: false, reason: "human_cooldown_elapsed", state };
  return {
    blocked: state.human_takeover || (state.bot_ativo === false && state.cv?.human_takeover_reason !== "emergency_manual_takeover_fix"),
    reason: "human_takeover",
    state,
  };
}

async function activeFinancialRestriction(a:any,orgId:string,conversationId:string|null,target:string){let clientId:string|null=null;if(conversationId){const {data}=await a.from('whatsapp_conversations').select('client_id,contact_id').eq('org_id',orgId).eq('id',conversationId).maybeSingle();clientId=data?.client_id||null;if(!clientId&&data?.contact_id){const {data:ct}=await a.from('whatsapp_contacts').select('client_id').eq('id',data.contact_id).maybeSingle();clientId=ct?.client_id||null}}if(!clientId){const p=digits(target);const {data:ct}=await a.from('whatsapp_contacts').select('client_id').eq('org_id',orgId).eq('phone',p).limit(1).maybeSingle();clientId=ct?.client_id||null}if(!clientId)return null;const {data:r}=await a.from('client_service_restrictions').select('id,client_id').eq('org_id',orgId).eq('client_id',clientId).eq('active',true).limit(1).maybeSingle();return r||null;}
async function log(a: any, row: any) {
  try { await a.from("whatsapp_outbound_gate_log").insert(row); } catch {}
}
async function trace(a: any, orgId: string, conversationId: string | null, agentKey: string, decision: string, metadata: any) {
  if (!conversationId) return;
  try {
    await a.from("ai_orchestrator_events").insert({ org_id: orgId, conversation_id: conversationId, event_type: "whatsapp_reply_pipeline", agent_key: agentKey, decision, reason: metadata?.reason || null, metadata });
  } catch {}
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Método inválido" }, 405);
  if (new URL(req.url).searchParams.get("uazapi_webhook") === "1") {
    return json({ ok: false, error: "uazapi_disabled" }, 410);
  }
  try {
    const service = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim(), auth = (req.headers.get("authorization") || "").trim();
    if (!service || auth !== `Bearer ${service}`) return json({ ok: false, error: "Não autorizado" }, 401);
    const b = await req.json().catch(() => ({}));
    const orgId = String(b.org_id || "").trim(),
      conversationId = b.conversation_id ? String(b.conversation_id) : null,
      target = String(b.phone || b.to || b.chat_id || "").trim(),
      agentKey = String(b.agent_key || "system").trim(),
      key = String(b.idempotency_key || "").trim() || null,
      rawMessage = String(b.message || "").trim(),
      image = b.image ? String(b.image) : null,
      document = b.document ? String(b.document) : null,
      fileName = b.file_name ? String(b.file_name).replace(/[\\/]/g, "-").slice(0, 180) : null,
      caption = b.caption ? String(b.caption) : null;
    if (!orgId || !target || (!rawMessage && !image && !document)) return json({ ok: false, error: "org_id, destino e mensagem ou mídia são obrigatórios" }, 400);
    const reactiveKeys = new Set(["helena_chatbot","client_service_triage","sales","client_schedule_relationship"]);
    const humanRequested = b.operator_send === true || String(key || "").startsWith("operator:");
    const automatedPrefix = /^(notification:|collection:|alert:|process-notification:|lexsign-remind-)/i.test(String(key || ""));
    const proactive = b.proactive === true || (!humanRequested && (automatedPrefix || (!reactiveKeys.has(agentKey) && agentKey !== "system" && agentKey !== "helena_office")));
    if (proactive && !humanRequested) {
      const parts = new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",weekday:"short",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
      const weekday = parts.find(p=>p.type==="weekday")?.value || "";
      const hour = Number(parts.find(p=>p.type==="hour")?.value || "-1");
      if (!["Mon","Tue","Wed","Thu","Fri"].includes(weekday) || hour < 8 || hour >= 18)
        return json({ok:false,allowed:false,reason:"outside_business_hours",retryable:true},429);
    }
    const cooldownMin = Number.isFinite(Number(b.human_silence_minutes)) && Number(b.human_silence_minutes) >= 0 ? Number(b.human_silence_minutes) : DEFAULT_COOLDOWN_MIN;
    const cooldownMs = cooldownMin * 60 * 1000;
    const a = admin();
    if (key) {
      const { data: existing } = await a.from("whatsapp_outbound_gate_log").select("id,allowed,reason").eq("org_id", orgId).eq("idempotency_key", key).maybeSingle();
      if (existing && existing.allowed === true) return json({ ok: true, duplicate: true, allowed: true, reason: existing.reason });
    }
    // Envios do painel (whatsapp-operator-send usam chave "operator:") são humanos ou ordens da Dra.: nunca bloqueia.
    if (b.operator_send !== true && !String(key || "").startsWith("operator:") && await aiKillSwitch(a, orgId, conversationId, target, agentKey)) {
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: "ai_disabled_global", body_preview: previewForLog(rawMessage, 240), idempotency_key: key });
      return json({ ok: true, allowed: false, reason: "ai_disabled_global" });
    }
    const restriction=await activeFinancialRestriction(a,orgId,conversationId,target);
    const helenaRestrictedOk = agentKey === 'helena_office' && b.restricted_mode === true;
    if(restriction&&agentKey!=='billing'&&!helenaRestrictedOk){await log(a,{org_id:orgId,conversation_id:conversationId,agent_key:agentKey,allowed:false,reason:'financial_service_restriction',body_preview:previewForLog(rawMessage,240),idempotency_key:key});return json({ok:true,allowed:false,reason:'financial_service_restriction'});}
    const automated = AGENT_KEYS.has(agentKey) || b.format_agent_reply === true,
      formatted = automated
        ? formatWhatsAppAgentReply(rawMessage, { includeHeader: false })
        : { rawAgentOutput: rawMessage, parsedReply: sanitize(rawMessage), formattedReply: sanitize(rawMessage) },
      message = formatted.formattedReply;
    if (!message && !image && !document) return json({ ok: false, error: "Mensagem vazia após formatação" }, 400);
    if (unsafe(formatted.parsedReply)) {
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: "unsafe_internal_content", body_preview: previewForLog(formatted.parsedReply, 240), idempotency_key: key });
      return json({ ok: true, allowed: false, reason: "unsafe_internal_content" });
    }
    const panelAutomated = b.operator_send !== true && !String(key || "").startsWith("operator:") && (automated || b.triage_reply === true || ["concierge","legal_triage","scheduler","sdr","closer","proposal_recovery","customer_success","support_n1","retention"].includes(agentKey));
    const panelReply = b.triage_reply === true || ["concierge","legal_triage","scheduler","sdr","closer","proposal_recovery","customer_success","support_n1","retention"].includes(agentKey);
    const hb = await blockedByHuman(a, orgId, conversationId, target, automated, cooldownMs, panelAutomated);
    if (hb.blocked) {
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: hb.reason, body_preview: previewForLog(message, 240), idempotency_key: key });
      return json({ ok: true, allowed: false, reason: hb.reason, resume_at: hb.state.cooldown_until });
    }
    const providerName = await activeProvider(a);
    await trace(a, orgId, conversationId, agentKey, "ready_to_send", { provider: providerName });
    try {
      // Recheck immediately before provider submission: an operator may have taken over while the reply was prepared.
      if (panelAutomated) {
        const fresh = await blockedByHuman(a, orgId, conversationId, target, automated, cooldownMs, panelAutomated);
        if (fresh.state.panel_managed && (fresh.blocked || (panelReply && fresh.state.global_ai_enabled !== true))) {
          const reason = fresh.blocked ? "human_takeover" : "ai_disabled_global";
          await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason, body_preview: previewForLog(message, 240), idempotency_key: key });
          return json({ ok: true, allowed: false, reason });
        }
        if (fresh.state.panel_managed && panelReply) {
          const policy = await a.from("ai_agent_policies").select("active,allowed_channels").eq("org_id", orgId).eq("agent_key", agentKey).maybeSingle();
          if (policy.error || policy.data?.active !== true || !policy.data?.allowed_channels?.includes("whatsapp")) return json({ ok: true, allowed: false, reason: "agent_not_authorized" });
        }
      }
      const delay = automated ? Number(b.delay_seconds || 0) : 0;
      const provider = await evolutionSend(a, orgId, target, message, delay, b.typing_indicator === true, image, caption, document, fileName);
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: true, reason: "sent_" + providerName, body_preview: previewForLog(message, 240), idempotency_key: key });
      const externalId = String(provider?.messageid || provider?.key?.id || provider?.zaapId || provider?.messageId || provider?.id || "") || null;
      if (conversationId && automated) {
        try {
          await a.from("whatsapp_messages").insert({ org_id: orgId, conversation_id: conversationId, direction: "outbound", message_type: document ? "document" : image ? "image" : "text", body: formatted.parsedReply, status: "sent", sent_at: new Date().toISOString(), external_message_id: externalId, metadata: { source: "ai_agent", agent_key: agentKey, file_name: fileName, provider: providerName } });
          await a.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: previewForLog(formatted.parsedReply, 120), updated_at: new Date().toISOString() }).eq("id", conversationId);
        } catch (e) { console.error("history_insert", e); }
      }
      return json({ ok: true, allowed: true, provider: providerName, phone: digits(target), external_message_id: externalId, provider_response: provider, parsed_reply: formatted.parsedReply, formatted_reply: message });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: providerName + "_send_failed:" + err.slice(0, 180), body_preview: previewForLog(message, 240), idempotency_key: key });
      await trace(a, orgId, conversationId, agentKey, "provider_error", { reason: providerName + "_send_failed", error: err });
      return json({ ok: false, error: err }, 502);
    }
  } catch (e) {
    console.error("whatsapp-outbound-gate", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
