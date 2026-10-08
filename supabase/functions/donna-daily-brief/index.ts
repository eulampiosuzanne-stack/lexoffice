import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-donna-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Configuração interna indisponível");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function rows(query: any) {
  const { data, error } = await query;
  if (error) throw new Error(error.message || "Falha ao consultar os dados");
  return data ?? [];
}
function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
function localMidnightUtc(day: string) {
  // São Paulo está em UTC-3; assim, a meia-noite local corresponde a 03:00 UTC.
  return new Date(`${day}T03:00:00.000Z`);
}
function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function clean(value: unknown, max = 90) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}
function localStamp(value: string, withTime = true) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}
function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}
function processLabel(process: any, clientName: string | undefined) {
  if (process?.is_confidential) return null;
  const parts = [clientName, process?.cnj_number ? `CNJ ${process.cnj_number}` : null, clean(process?.subject, 65)].filter(Boolean);
  return parts.join(" • ") || "Processo";
}

async function makeBrief(a: any, orgId: string, today: string) {
  const start = localMidnightUtc(today);
  const end = localMidnightUtc(addDays(today, 4));
  const movementSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const stalledBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [hearings, deadlines, movements, conversations, activeProcesses] = await Promise.all([
    rows(a.from("process_hearings").select("id,process_id,client_id,title,starts_at,status")
      .eq("org_id", orgId).eq("status", "scheduled").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at").limit(100)),
    rows(a.from("process_deadlines").select("id,process_id,client_id,title,due_at,status")
      .eq("org_id", orgId).eq("status", "pending").gte("due_at", start.toISOString()).lt("due_at", end.toISOString()).order("due_at").limit(100)),
    rows(a.from("process_movements").select("id,process_id,title,created_at,is_sensitive")
      .eq("org_id", orgId).gte("created_at", movementSince).order("created_at", { ascending: false }).limit(100)),
    rows(a.from("whatsapp_conversations").select("id,client_id,last_message_at,unread_count")
      .eq("org_id", orgId).eq("conversation_owner", "HUMAN").neq("status", "closed").gt("unread_count", 0)
      .not("client_id", "is", null).order("last_message_at").limit(100)),
    rows(a.from("processes").select("id,client_id,cnj_number,subject,is_confidential,created_at,status")
      .eq("org_id", orgId).eq("status", "active").neq("is_demo", true).lt("created_at", stalledBefore).limit(1000)),
  ]);

  const processIds = [...new Set([
    ...hearings.map((x: any) => x.process_id), ...deadlines.map((x: any) => x.process_id),
    ...movements.map((x: any) => x.process_id),
  ].filter(Boolean))] as string[];
  const [relatedProcesses, movementRecent, clients] = await Promise.all([
    processIds.length ? rows(a.from("processes").select("id,client_id,cnj_number,subject,is_confidential").eq("org_id", orgId).in("id", processIds)) : [],
    activeProcesses.length ? rows(a.from("process_movements").select("process_id").eq("org_id", orgId)
      .in("process_id", activeProcesses.map((x: any) => x.id)).gte("created_at", stalledBefore).limit(5000)) : [],
    (() => {
      const ids = [...new Set([
        ...hearings.map((x: any) => x.client_id), ...deadlines.map((x: any) => x.client_id),
        ...activeProcesses.map((x: any) => x.client_id), ...conversations.map((x: any) => x.client_id),
      ].filter(Boolean))] as string[];
      return ids.length ? rows(a.from("clients").select("id,name").eq("org_id", orgId).in("id", ids)) : [];
    })(),
  ]);
  const processMap = new Map<string, any>([...activeProcesses, ...relatedProcesses].map((x: any) => [x.id, x]));
  const clientMap = new Map<string, string>(clients.map((x: any) => [x.id, clean(x.name, 70)]));
  const recentSet = new Set(movementRecent.map((x: any) => x.process_id));
  const clientName = (id: string | null) => id ? clientMap.get(id) : undefined;

  const agenda: string[] = [];
  for (const h of hearings) {
    const p = processMap.get(h.process_id);
    if (p?.is_confidential) agenda.push(`• Audiência em processo sob sigilo — ${localStamp(h.starts_at)}.`);
    else agenda.push(`• Audiência ${localStamp(h.starts_at)} — ${clean(h.title || "Audiência", 70)}${clientName(h.client_id) ? ` (${clientName(h.client_id)})` : ""}.`);
  }
  for (const d of deadlines) {
    const p = processMap.get(d.process_id);
    if (p?.is_confidential) agenda.push(`• Prazo em processo sob sigilo — ${localStamp(d.due_at, false)}.`);
    else agenda.push(`• Prazo ${localStamp(d.due_at, false)} — ${clean(d.title || "Prazo", 70)}${clientName(d.client_id) ? ` (${clientName(d.client_id)})` : ""}.`);
  }

  const movementLines: string[] = [];
  let confidentialMovementCount = 0;
  for (const m of movements) {
    const p = processMap.get(m.process_id);
    if (p?.is_confidential || m.is_sensitive) { confidentialMovementCount++; continue; }
    const label = processLabel(p, clientName(p?.client_id));
    movementLines.push(`• ${localStamp(m.created_at)} — ${clean(m.title || "Novo andamento", 90)}${label ? ` (${label})` : ""}.`);
  }
  if (confidentialMovementCount) movementLines.push(`• ${confidentialMovementCount} novo(s) andamento(s) em processo(s) sigiloso(s) ou sensível(is).`);

  const waiting = conversations.map((x: any) => clientName(x.client_id)).filter(Boolean) as string[];
  const uniqueWaiting = [...new Set(waiting)].slice(0, 20);
  const stalled = activeProcesses.filter((p: any) => !recentSet.has(p.id));
  const stalledVisible = stalled.filter((p: any) => !p.is_confidential).slice(0, 10);
  const stalledConfidentialCount = stalled.filter((p: any) => p.is_confidential).length;
  const stalledLines = stalledVisible.map((p: any) => {
    const label = processLabel(p, clientName(p.client_id));
    return `• ${label || "Processo"} — sem andamento há mais de 30 dias.`;
  });
  if (stalled.length > stalledVisible.length && stalledConfidentialCount) {
    stalledLines.push(`• ${stalledConfidentialCount} processo(s) sob sigilo sem andamento há mais de 30 dias.`);
  }

  const sections: string[] = [];
  if (agenda.length) sections.push(`Audiências e prazos (hoje e próximos 3 dias):\n${agenda.slice(0, 20).join("\n")}`);
  if (movementLines.length) sections.push(`Andamentos novos (últimas 24 horas):\n${movementLines.slice(0, 15).join("\n")}`);
  if (uniqueWaiting.length) sections.push(`Clientes aguardando resposta:\n${uniqueWaiting.map((name) => `• ${name}`).join("\n")}${waiting.length > uniqueWaiting.length ? `\n• E mais ${waiting.length - uniqueWaiting.length} cliente(s).` : ""}`);
  if (stalledLines.length) sections.push(`Processos parados há mais de 30 dias:\n${stalledLines.join("\n")}${stalled.length > stalledVisible.length + stalledConfidentialCount ? `\n• E mais ${stalled.length - stalledVisible.length - stalledConfidentialCount} processo(s).` : ""}`);

  if (!sections.length) return { message: "", counts: { hearings: 0, deadlines: 0, movements: 0, waitingClients: 0, stalledProcesses: 0 } };
  const message = `Bom dia, Dra. Suzanne.\n\nResumo do escritório — ${localStamp(`${today}T12:00:00Z`, false)}\n\n${sections.join("\n\n")}\n\nLEXOFFICE`;
  return {
    message: message.slice(0, 3900),
    counts: {
      hearings: hearings.length, deadlines: deadlines.length, movements: movements.length,
      waitingClients: uniqueWaiting.length, stalledProcesses: stalled.length,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" }, 405);
  try {
    const a = admin();
    const supplied = (req.headers.get("x-donna-token") || "").trim();
    const { data: secretRow, error: secretError } = await a.from("system_runtime_secrets")
      .select("secret").eq("key", "donna_daily_brief_token").maybeSingle();
    if (secretError || !secretRow?.secret || supplied !== String(secretRow.secret).trim()) {
      return json({ ok: false, error: "Não autorizado" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const today = localDate();
    const settings = await rows(a.from("whatsapp_settings").select("org_id,alert_phone")
      .eq("alerts_enabled", true).not("alert_phone", "is", null));
    const results = [];

    for (const setting of settings) {
      const orgId = String(setting.org_id || "");
      const phone = digits(setting.alert_phone);
      if (!orgId || phone.length < 10 || phone.length > 15) continue;

      const brief = await makeBrief(a, orgId, today);
      if (!brief.message) {
        results.push({ org_id: orgId, skipped: "nothing_to_send", counts: brief.counts });
        continue;
      }
      if (dryRun) {
        results.push({ org_id: orgId, dry_run: true, would_send: true, counts: brief.counts });
        continue;
      }

      const idempotencyKey = `donna:daily-brief:${orgId}:${today}`;
      const { data: existing, error: existingError } = await a.from("donna_daily_brief_runs")
        .select("status,created_at").eq("org_id", orgId).eq("brief_date", today).maybeSingle();
      if (existingError) throw new Error("Não foi possível conferir o envio diário");
      if (existing?.status === "sent") {
        results.push({ org_id: orgId, skipped: "already_sent" });
        continue;
      }
      if (existing?.status === "processing" && Date.now() - new Date(existing.created_at).getTime() < 10 * 60 * 1000) {
        results.push({ org_id: orgId, skipped: "already_processing" });
        continue;
      }
      if (existing) {
        const { error } = await a.from("donna_daily_brief_runs").delete().eq("org_id", orgId).eq("brief_date", today);
        if (error) throw new Error("Não foi possível liberar uma nova tentativa");
      }
      const { error: claimError } = await a.from("donna_daily_brief_runs")
        .insert({ org_id: orgId, brief_date: today, status: "processing" });
      if (claimError) {
        results.push({ org_id: orgId, skipped: "another_run_claimed" });
        continue;
      }

      try {
        const { data: gateResult, error: gateError } = await a.functions.invoke("whatsapp-outbound-gate", {
          body: {
            org_id: orgId,
            phone,
            agent_key: "system",
            idempotency_key: idempotencyKey,
            message: brief.message,
            format_agent_reply: false,
          },
        });
        if (gateError || !gateResult?.ok || gateResult?.allowed === false) {
          throw new Error(gateResult?.reason || gateResult?.error || gateError?.message || "Falha no envio do WhatsApp");
        }
        const { error: updateError } = await a.from("donna_daily_brief_runs")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("org_id", orgId).eq("brief_date", today);
        if (updateError) throw new Error("Mensagem enviada, mas não foi possível registrar o resultado");
        results.push({ org_id: orgId, sent: true, duplicate: gateResult.duplicate === true, counts: brief.counts });
      } catch (error) {
        await a.from("donna_daily_brief_runs").update({ status: "failed" })
          .eq("org_id", orgId).eq("brief_date", today);
        throw error;
      }
    }
    return json({ ok: true, date: today, results });
  } catch (error) {
    console.error("donna-daily-brief", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Falha inesperada" }, 500);
  }
});
