import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import {
  formatWhatsAppAgentReply,
  previewForLog,
} from "./_shared/whatsapp-reply-format.mjs";
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
async function zapiCfg(a: any) {
  const instance = (
    (await runtimeSecret(a, "zapi_instance_id")) ||
    (await runtimeSecret(a, "ZAPI_INSTANCE_ID")) ||
    Deno.env.get("ZAPI_INSTANCE_ID") || ""
  ).trim();
  const token = (
    (await runtimeSecret(a, "zapi_instance_token")) ||
    (await runtimeSecret(a, "zapi_token")) ||
    (await runtimeSecret(a, "ZAPI_INSTANCE_TOKEN")) ||
    (await runtimeSecret(a, "ZAPI_TOKEN")) ||
    Deno.env.get("ZAPI_TOKEN") || ""
  ).trim();
  const clientToken = (
    (await runtimeSecret(a, "zapi_client_token")) ||
    (await runtimeSecret(a, "ZAPI_CLIENT_TOKEN")) ||
    Deno.env.get("ZAPI_CLIENT_TOKEN") || ""
  ).trim();
  if (!instance || !token || !clientToken) throw new Error("Z-API não configurada no backend");
  return { instance, token, clientToken };
}
async function zapiSend(a: any, phone: string, message: string, delaySeconds = 0, typing = false) {
  const c = await zapiCfg(a), p = digits(phone);
  if (!p) throw new Error("Destino inválido");
  const payload: any = { phone: p, message };
  const d = Math.max(0, Math.min(15, Math.round(Number(delaySeconds) || 0)));
  if (d >= 1) {
    if (typing) payload.delayTyping = d;
    else payload.delayMessage = d;
  }
  const r = await fetch(
    `https://api.z-api.io/instances/${encodeURIComponent(c.instance)}/token/${encodeURIComponent(c.token)}/send-text`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "Client-Token": c.clientToken },
      body: JSON.stringify(payload),
    },
  );
  const raw = await r.text();
  let out: any = {};
  try { out = raw ? JSON.parse(raw) : {}; } catch { out = { raw }; }
  if (!r.ok) throw new Error(`Z-API ${r.status}: ${String(out?.message || out?.error || raw || "falha").slice(0, 500)}`);
  return out;
}
function sanitize(text: string) {
  return text.replace(/^\s*(suporte|support)\s*:\s*/i, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function unsafe(text: string) {
  return /(bot_ativo|human_takeover|ai_enabled|resume_at|system prompt|prompt interno|racioc[ií]nio interno|verifica[cç][aã]o de estado|transbordo humano|registro de poss[ií]vel)/i.test(text);
}
async function conversationState(a: any, orgId: string, conversationId: string | null, target: string, cooldownMs: number) {
  let cv: any = null;
  const cols = "id,bot_ativo,conversation_owner,human_takeover_at,human_takeover_reason,last_human_outbound_at";
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
    bot_ativo: cv?.bot_ativo ?? null,
    human_takeover: !emergencyOnly && Boolean(cv?.conversation_owner === "HUMAN" || cv?.human_takeover_at || ctl?.human_takeover === true || ctl?.ai_enabled === false),
    last_human_outbound_at: lastHumanAt ? new Date(lastHumanAt).toISOString() : null,
    cooldown_until: cooldownUntil ? new Date(cooldownUntil).toISOString() : null,
    human_cooldown_active: humanCooldownActive,
  };
}
async function blockedByHuman(a: any, orgId: string, conversationId: string | null, target: string, automated: boolean, cooldownMs: number) {
  const state = await conversationState(a, orgId, conversationId, target, cooldownMs);
  if (!automated) return { blocked: false, reason: "human_operator_allowed", state };
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
  try {
    const service = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim(), auth = (req.headers.get("authorization") || "").trim();
    if (!service || auth !== `Bearer ${service}`) return json({ ok: false, error: "Não autorizado" }, 401);
    const b = await req.json().catch(() => ({}));
    const orgId = String(b.org_id || "").trim(),
      conversationId = b.conversation_id ? String(b.conversation_id) : null,
      target = String(b.phone || b.to || b.chat_id || "").trim(),
      agentKey = String(b.agent_key || "system").trim(),
      key = String(b.idempotency_key || "").trim() || null,
      rawMessage = String(b.message || "").trim();
    if (!orgId || !target || !rawMessage) return json({ ok: false, error: "org_id, destino e mensagem são obrigatórios" }, 400);
    const cooldownMin = Number.isFinite(Number(b.human_silence_minutes)) && Number(b.human_silence_minutes) >= 0 ? Number(b.human_silence_minutes) : DEFAULT_COOLDOWN_MIN;
    const cooldownMs = cooldownMin * 60 * 1000;
    const a = admin();
    if (key) {
      const { data: existing } = await a.from("whatsapp_outbound_gate_log").select("id,allowed,reason").eq("org_id", orgId).eq("idempotency_key", key).maybeSingle();
      if (existing && existing.allowed === true) return json({ ok: true, duplicate: true, allowed: true, reason: existing.reason });
    }
    const restriction=await activeFinancialRestriction(a,orgId,conversationId,target);
    if(restriction&&agentKey!=='billing'){await log(a,{org_id:orgId,conversation_id:conversationId,agent_key:agentKey,allowed:false,reason:'financial_service_restriction',body_preview:previewForLog(rawMessage,240),idempotency_key:key});return json({ok:true,allowed:false,reason:'financial_service_restriction'});}
    const automated = AGENT_KEYS.has(agentKey) || b.format_agent_reply === true,
      formatted = automated
        ? formatWhatsAppAgentReply(rawMessage, {
            header: typeof b.signature_line === "string" ? b.signature_line : undefined,
            blankLine: b.blank_line_after_signature !== false,
          })
        : { rawAgentOutput: rawMessage, parsedReply: sanitize(rawMessage), formattedReply: sanitize(rawMessage) },
      message = formatted.formattedReply;
    if (!message) return json({ ok: false, error: "Mensagem vazia após formatação" }, 400);
    if (unsafe(formatted.parsedReply)) {
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: "unsafe_internal_content", body_preview: previewForLog(formatted.parsedReply, 240), idempotency_key: key });
      return json({ ok: true, allowed: false, reason: "unsafe_internal_content" });
    }
    const hb = await blockedByHuman(a, orgId, conversationId, target, automated, cooldownMs);
    if (hb.blocked) {
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: hb.reason, body_preview: previewForLog(message, 240), idempotency_key: key });
      return json({ ok: true, allowed: false, reason: hb.reason, resume_at: hb.state.cooldown_until });
    }
    await trace(a, orgId, conversationId, agentKey, "ready_to_send", { provider: "zapi" });
    try {
      const provider = await zapiSend(a, target, message, automated ? Number(b.delay_seconds || 0) : 0, b.typing_indicator === true);
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: true, reason: "sent_zapi", body_preview: previewForLog(message, 240), idempotency_key: key });
      // v34: grava a resposta no histórico da conversa (a IA precisa ver o que já respondeu).
      if (conversationId && automated) {
        try {
          await a.from("whatsapp_messages").insert({ org_id: orgId, conversation_id: conversationId, direction: "outbound", message_type: "text", body: formatted.parsedReply, status: "sent", sent_at: new Date().toISOString(), external_message_id: String(provider?.zaapId || provider?.messageId || provider?.id || "") || null, metadata: { source: "ai_agent", agent_key: agentKey } });
          await a.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: previewForLog(formatted.parsedReply, 120), updated_at: new Date().toISOString() }).eq("id", conversationId);
        } catch (e) { console.error("history_insert", e); }
      }
      return json({ ok: true, allowed: true, provider: "zapi", phone: digits(target), provider_response: provider, parsed_reply: formatted.parsedReply, formatted_reply: message });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await log(a, { org_id: orgId, conversation_id: conversationId, agent_key: agentKey, allowed: false, reason: "zapi_send_failed:" + err.slice(0, 180), body_preview: previewForLog(message, 240), idempotency_key: key });
      await trace(a, orgId, conversationId, agentKey, "provider_error", { reason: "zapi_send_failed", error: err });
      return json({ ok: false, error: err }, 502);
    }
  } catch (e) {
    console.error("whatsapp-outbound-gate", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
