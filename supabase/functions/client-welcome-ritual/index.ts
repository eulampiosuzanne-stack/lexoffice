import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

// Ritual de boas-vindas (Dra. Suzanne, 10/11/2026).
// Contrato de honorários assinado (lex_signature_requests -> trigger) cria 1 ritual por contratação em client_welcome_rituals.
// Este worker: confere consentimento/restrições/histórico, envia a mensagem da Helena + card institucional pelo
// whatsapp-outbound-gate (respeita horário comercial, intervenção humana e regras da Meta), publica no app do cliente
// e registra tudo no histórico (client_events). Modo controlado por system_runtime_secrets.welcome_ritual_mode:
//   off  = não faz nada | test = só envia para números de ai_test_allowlist (demais ficam "held_test_mode") | live = envia.
// v4: card v3 (arte com a foto da Dra. Suzanne); sem link do app na mensagem (o acesso vai pelo onboarding); áudio como mensagem de voz (OGG/Opus).

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const env = (k: string) => (Deno.env.get(k) || "").trim();
const CARD_URL_DEFAULT = "https://lexoffice-ashy.vercel.app/brand/boas-vindas-v3.jpg";
const digits = (s: unknown) => String(s || "").replace(/\D/g, "");
const withDdi = (p: string) => (p.startsWith("55") ? p : "55" + p);

export function firstName(name: string) {
  const n = String(name || "").trim().split(/\s+/)[0] || "";
  if (!n || /\d/.test(n)) return "";
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}
export function welcomeText(name: string) {
  const nome = firstName(name);
  return [
    `🌷 Seja bem-vindo(a) ao nosso escritório${nome ? `, ${nome}` : ""}!`,
    "",
    "Seu atendimento agora faz parte da nossa equipe de acompanhamento jurídico.",
    "",
    "Nossa equipe já está cuidando de tudo para você!",
    "",
    "Sou a Helena e estarei por aqui para ajudar no que precisar. 💛",
    "",
    "📲 No seu aplicativo você acompanha o processo, envia documentos e deixa recados para a Dra. Suzanne.",
    "",
    "Sempre que houver novidade no seu processo, aviso você por aqui.",
  ].join("\n");
}

export function audioText(name: string) {
  const nome = firstName(name);
  return `Olá${nome ? `, ${nome}` : ""}! Eu sou a Helena, concierge jurídica do escritório Suzanne Figueiredo. Seja muito bem-vindo, ou bem-vinda! A partir de agora, acompanhamos o seu caso de perto. Sempre que houver novidade no seu processo, eu aviso você por aqui. E no seu aplicativo você encontra o andamento do processo, os seus compromissos, os documentos e um canal para deixar recados para a Doutora Suzanne. Conte comigo!`;
}
async function secret(db: any, key: string) {
  const { data } = await db.from("system_runtime_secrets").select("secret").eq("key", key).maybeSingle();
  return String(data?.secret || "").trim();
}
async function gate(orgId: string, phone: string, body: Record<string, unknown>) {
  const sk = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(env("SUPABASE_URL") + "/functions/v1/whatsapp-outbound-gate", {
    method: "POST", headers: { Authorization: "Bearer " + sk, apikey: sk, "Content-Type": "application/json" },
    body: JSON.stringify({ org_id: orgId, phone, agent_key: "client_service_triage", proactive: true, ...body }),
  });
  const d = await r.json().catch(() => null);
  return { ok: r.ok && (d?.allowed === true || d?.duplicate === true), status: r.status, reason: String(d?.reason || d?.error || (r.ok ? "" : "http_" + r.status)), retryable: d?.retryable === true || r.status === 429 };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Método inválido" }, 405);
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const expected = await secret(db, "datajud_sync_token");
  if (!expected || (req.headers.get("x-sync-token") || "") !== expected) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const mode = ((await secret(db, "welcome_ritual_mode")) || "test").toLowerCase();
  if (mode === "off") return json({ ok: true, mode, processed: 0 });
  const allow = new Set((await secret(db, "ai_test_allowlist")).split(/[,;\s]+/).map(digits).filter(Boolean));
  const cardUrl = (await secret(db, "welcome_card_url")) || CARD_URL_DEFAULT;
  const dryRun = body?.dry_run === true;
  // Reenvio de teste controlado (só com ritual_id): sufixo novo nas chaves de idempotência.
  const sfx = body?.ritual_id && body?.test_suffix ? ":" + String(body.test_suffix).replace(/[^\w-]/g, "").slice(0, 20) : "";

  let q = db.from("client_welcome_rituals").select("*").in("status", ["pending", "held_test_mode", "partial"]).lt("attempts", 6).order("created_at").limit(10);
  if (body?.ritual_id) q = db.from("client_welcome_rituals").select("*").eq("id", String(body.ritual_id)).limit(1);
  const { data: rituals, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);
  const results: any[] = [];

  for (const r of rituals || []) {
    const now = new Date().toISOString();
    const steps: Record<string, unknown> = { ...(r.steps || {}) };
    const finish = async (status: string, err: string | null = null) => {
      if (dryRun) return;
      await db.from("client_welcome_rituals").update({ status, steps, error: err, attempts: (r.attempts || 0) + (status === "held_test_mode" ? 0 : 1), updated_at: now, ...(status === "sent" ? { sent_at: now } : {}) }).eq("id", r.id);
    };
    const { data: c } = await db.from("clients").select("id,name,whatsapp,phone,status,owner_user_id").eq("id", r.client_id).maybeSingle();
    if (!c) { await finish("skipped", "cliente_nao_encontrado"); results.push({ id: r.id, status: "skipped", reason: "cliente_nao_encontrado" }); continue; }
    if (String(c.status || "") === "inactive") { await finish("skipped", "cliente_inativo"); results.push({ id: r.id, status: "skipped", reason: "cliente_inativo" }); continue; }
    const { data: pref } = await db.from("client_notification_preferences").select("whatsapp_enabled").eq("client_id", c.id).limit(1).maybeSingle();
    if (pref && pref.whatsapp_enabled === false) { await finish("skipped", "cliente_sem_consentimento_whatsapp"); results.push({ id: r.id, status: "skipped", reason: "sem_consentimento" }); continue; }
    // Histórico único: se este cliente já recebeu boas-vindas por outra contratação nos últimos 30 dias, não repete.
    const { data: prev } = await db.from("client_events").select("id,created_at").eq("client_id", c.id).eq("type", "note").eq("metadata->>kind", "boas_vindas_enviadas").gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(1);
    if (prev?.length && !body?.ritual_id) { await finish("skipped", "boas_vindas_ja_enviadas_recentemente"); results.push({ id: r.id, status: "skipped", reason: "ja_recebeu" }); continue; }
    const phone = withDdi(digits(c.whatsapp || c.phone));
    if (phone.length < 12 || phone.length > 13) { await finish("failed", "telefone_invalido"); results.push({ id: r.id, status: "failed", reason: "telefone_invalido" }); continue; }
    if (mode !== "live" && !allow.has(phone) && !allow.has(phone.slice(2))) {
      steps.modo = "teste: aguardando liberação (número fora da lista de teste)";
      await finish("held_test_mode"); results.push({ id: r.id, status: "held_test_mode" }); continue;
    }
    const text = welcomeText(c.name);
    if (dryRun) { results.push({ id: r.id, status: "dry_run", phone_final: phone.slice(-4), text, card: cardUrl }); continue; }

    let ok = true, lastReason = "";
    if (!steps.mensagem) {
      const g = await gate(r.org_id, phone, { message: text, idempotency_key: `welcome:${r.id}:texto${sfx}` });
      if (g.ok) steps.mensagem = now; else { ok = false; lastReason = g.reason; }
    }
    if (ok && !steps.card) {
      const g = await gate(r.org_id, phone, { image: cardUrl, caption: "Suzanne Figueiredo Advocacia e Soluções Jurídicas", message: "Suzanne Figueiredo Advocacia e Soluções Jurídicas", idempotency_key: `welcome:${r.id}:card${sfx}` });
      if (g.ok) steps.card = now; else { ok = false; lastReason = g.reason; }
    }
    // Áudio de apresentação com voz brasileira natural (Azure pt-BR-FranciscaNeural), enviado como mensagem de voz (OGG/Opus, toca com botão de play).
    if (ok && !steps.audio) {
      try {
        const sk = env("SUPABASE_SERVICE_ROLE_KEY");
        const tts = await fetch(env("SUPABASE_URL") + "/functions/v1/azure-tts", { method: "POST", headers: { "Content-Type": "application/json", "x-sync-token": expected, Authorization: "Bearer " + sk }, body: JSON.stringify({ text: audioText(c.name), format: "ogg" }) });
        if (!tts.ok) throw new Error("tts_http_" + tts.status);
        const bytes = new Uint8Array(await tts.arrayBuffer());
        let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const g = await gate(r.org_id, phone, { document: "data:audio/ogg;base64," + btoa(bin), file_name: "helena-boas-vindas.ogg", message: "Recado de voz da Helena", idempotency_key: `welcome:${r.id}:audio${sfx}` });
        if (g.ok) steps.audio = now; else steps.audio_erro = g.reason;
      } catch (e) { steps.audio_erro = e instanceof Error ? e.message : String(e); }
    }
    if (!steps.app && steps.mensagem) {
      try {
        const { error: pubErr } = await db.rpc("lexoffice_client_app_publish", {
          p_org: r.org_id, p_client: c.id, p_title: "Boas-vindas ao escritório",
          p_body: "Seja bem-vindo(a)! Aqui você acompanha seu processo, seus compromissos e documentos, e pode deixar recados para a Dra. Suzanne. Sempre que houver novidade, avisaremos você.",
          p_category: "processo", p_priority: "normal", p_requires_ack: false, p_source_table: "client_welcome_rituals", p_source_id: r.id, p_metadata: { kind: "welcome" },
        });
        if (pubErr) throw new Error(pubErr.message);
        steps.app = now;
      } catch (e) { steps.app_erro = e instanceof Error ? e.message : String(e); }
    }
    const status = steps.mensagem && steps.card ? "sent" : steps.mensagem ? "partial" : "pending";
    await finish(status, ok ? null : lastReason);
    if (steps.mensagem && !r.steps?.mensagem) {
      await db.from("client_events").insert({ org_id: r.org_id, client_id: c.id, type: "note", title: "Boas-vindas da Helena enviadas", description: "Mensagem de boas-vindas, card institucional e acesso ao aplicativo.", metadata: { kind: "boas_vindas_enviadas", ritual_id: r.id, steps }, owner_user_id: c.owner_user_id });
    }
    if (!ok && !/outside_business_hours/.test(lastReason) && (r.attempts || 0) >= 2) {
      await db.from("client_events").insert({ org_id: r.org_id, client_id: c.id, type: "note", title: "Falha no envio das boas-vindas", description: lastReason, metadata: { kind: "boas_vindas_falha", ritual_id: r.id }, owner_user_id: c.owner_user_id });
    }
    results.push({ id: r.id, status, reason: lastReason || null });
  }
  return json({ ok: true, mode, processed: results.length, results });
});
