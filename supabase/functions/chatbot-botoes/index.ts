import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import { step } from "./menu.ts";

// Chamada somente pelo gatilho do banco (cabeçalho x-bot-token). Responde com o menu aos contatos marcados "Só chatbot".
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const HUMAN_SILENCE_MS = 12 * 3600000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: secret } = await db.from("chatbot_only_secret").select("token").eq("id", true).maybeSingle();
  if (!secret?.token || req.headers.get("x-bot-token") !== secret.token) return json({ ok: false, error: "Não autorizado" }, 401);
  const b = await req.json().catch(() => ({}));
  try {
    const { data: m } = await db.from("whatsapp_messages").select("id,org_id,conversation_id,direction,body,message_type,created_at").eq("id", String(b.message_id || "")).maybeSingle();
    if (!m || m.direction !== "inbound") return json({ ok: true, ignored: "not_inbound" });
    if (Date.now() - new Date(m.created_at).getTime() > 5 * 60000) return json({ ok: true, ignored: "old_message" });
    const { data: cv } = await db.from("whatsapp_conversations").select("id,org_id,contact_id,owner_user_id,last_human_outbound_at").eq("id", m.conversation_id).eq("org_id", m.org_id).maybeSingle();
    if (!cv?.contact_id) return json({ ok: true, ignored: "no_conversation" });
    const { data: ct } = await db.from("whatsapp_contacts").select("name,phone,is_blocked").eq("id", cv.contact_id).maybeSingle();
    const phone = String(ct?.phone || "").replace(/\D/g, "");
    if (!phone || ct?.is_blocked) return json({ ok: true, ignored: "no_phone_or_blocked" });
    const { data: row } = await db.from("chatbot_only_contacts").select("*").eq("org_id", m.org_id).eq("contact_key", phone).maybeSingle();
    if (!row?.enabled) return json({ ok: true, ignored: "not_marked" });
    // A Dra. respondeu à mão há pouco: o robô fica calado.
    if (cv.last_human_outbound_at && Date.now() - new Date(cv.last_human_outbound_at).getTime() < HUMAN_SILENCE_MS) return json({ ok: true, ignored: "human_replied" });

    const type = String(m.message_type || "text");
    const first = String(ct?.name || "").trim().split(/\s+/)[0] || "";
    const r = step({ node: row.node, tries: row.tries, lastAt: row.last_inbound_at ? new Date(row.last_inbound_at) : null, name: /^[\p{L}'-]{2,}$/u.test(first) ? first : "", input: String(m.body || ""), attachment: ["image", "document", "video"].includes(type), now: new Date() });
    if (b.dry_run === true) return json({ ok: true, dry_run: true, result: r });

    // Trava otimista: duas mensagens simultâneas não geram resposta dupla.
    if (row.last_message_id === m.id) return json({ ok: true, duplicate: true });
    const { data: claimed } = await db.from("chatbot_only_contacts").update({ node: r.node, tries: r.tries, last_inbound_at: new Date().toISOString(), last_message_id: m.id, version: row.version + 1 })
      .eq("org_id", m.org_id).eq("contact_key", phone).eq("version", row.version).select("version");
    if (!claimed?.length) return json({ ok: true, duplicate: true });

    for (let i = 0; i < r.replies.length; i++) {
      const reply = r.replies[i];
      const gate = await fetch(url + "/functions/v1/whatsapp-outbound-gate", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + service },
        body: JSON.stringify({ org_id: m.org_id, conversation_id: cv.id, phone, agent_key: "system", message: reply.text, format_agent_reply: false, human_silence_minutes: 0, idempotency_key: `chatbot-botoes:${m.id}:${i}`,
          interactive: reply.menu ? { style: "menu", type: "list", button: reply.menu.button, body: reply.text, rows: reply.menu.rows } : undefined }),
      });
      const sent = await gate.json().catch(() => ({}));
      const ok = gate.ok && sent?.ok === true && sent?.allowed === true;
      const at = new Date().toISOString();
      await db.from("whatsapp_messages").insert({ org_id: m.org_id, conversation_id: cv.id, direction: "outbound", message_type: "text", body: reply.text, status: ok ? "sent" : "failed", sent_at: ok ? at : null,
        external_message_id: String(sent?.provider_response?.messageid || sent?.provider_response?.messageId || sent?.provider_response?.key?.id || sent?.provider_response?.id || "") || null,
        metadata: { source: "chatbot", sender_type: "automation", flow: "chatbot-botoes", reason: ok ? null : String(sent?.reason || sent?.error || gate.status).slice(0, 200) } });
      if (!ok) throw new Error("Envio recusado: " + String(sent?.reason || sent?.error || gate.status).slice(0, 200));
      await db.from("whatsapp_conversations").update({ last_message_at: at, last_message_preview: reply.text.slice(0, 120), updated_at: at }).eq("id", cv.id);
    }
    if (r.handoff && cv.owner_user_id) {
      await db.from("notifications").insert({ org_id: m.org_id, user_id: cv.owner_user_id, type: "service", title: "Chatbot: contato aguardando você", body: `${ct?.name || phone}: ${r.handoff}`, link: "/whatsapp", read: false });
    }
    return json({ ok: true, node: r.node, replies: r.replies.length });
  } catch (error) {
    console.error("chatbot-botoes", error instanceof Error ? error.message : String(error));
    return json({ ok: false, error: "Falha no chatbot" }, 502);
  }
});
