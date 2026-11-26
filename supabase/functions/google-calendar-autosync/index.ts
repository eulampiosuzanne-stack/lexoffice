import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2";
import { hearingsToSync } from "./hearings.mjs";
// Envia ao Google Agenda, sozinha, as reuniões, consultas e audiências da LEX (não envia prazos).
// Chamada pelo agendamento do banco com o cabeçalho x-sync-token (segredo google_calendar_sync_token).
const ORG = "b3dd3ed0-2a05-4087-8220-307a44352cec";
const TYPES = ["meeting", "appointment", "hearing", "consultation", "consultation_online", "client_consultation"];
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const gf = (url: string, token: string, init: RequestInit = {}) =>
  fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const gurl = (id?: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/primary/events${id ? "/" + encodeURIComponent(id) : ""}?conferenceDataVersion=1`;
function body(e: any) {
  const b: any = {
    summary: e.title || "Consulta online",
    description: [e.description || "", e.hearing ? `LEXOFFICE_HEARING_ID:${e.id.slice(8)}` : `LEXOFFICE_EVENT_ID:${e.id}`, e.client_id ? `LEXOFFICE_CLIENT_ID:${e.client_id}` : "", e.process_id ? `LEXOFFICE_PROCESS_ID:${e.process_id}` : ""].filter(Boolean).join("\n"),
    start: { dateTime: e.starts_at },
    end: { dateTime: e.ends_at || new Date(new Date(e.starts_at).getTime() + 3600000).toISOString() },
  };
  if (e.meeting_mode === "online") b.conferenceData = { createRequest: { requestId: `lexoffice-${e.id}-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };
  else if (e.location) b.location = e.location;
  return b;
}
async function accessToken(admin: any, userId: string) {
  const { data: t } = await admin.from("integration_oauth_tokens").select("*").eq("org_id", ORG).eq("owner_user_id", userId).eq("provider", "google_calendar").maybeSingle();
  if (!t) throw new Error("Tokens do Google não encontrados. Reconecte a Agenda.");
  if (t.access_token && t.expires_at && new Date(t.expires_at).getTime() > Date.now() + 60000) return t.access_token as string;
  if (!t.refresh_token) throw new Error("Token expirado sem refresh_token. Reconecte o Google.");
  const id = Deno.env.get("GOOGLE_CLIENT_ID"), secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Credenciais Google ausentes.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error(d?.error_description || "Falha ao renovar o token do Google.");
  await admin.from("integration_oauth_tokens").update({ access_token: d.access_token, expires_at: d.expires_in ? new Date(Date.now() + d.expires_in * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq("id", t.id);
  return d.access_token as string;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método inválido" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sec } = await admin.from("system_runtime_secrets").select("secret").eq("key", "google_calendar_sync_token").maybeSingle();
    const sent = req.headers.get("x-sync-token") || "";
    if (!sec?.secret || sent !== sec.secret) return json({ error: "Não autorizado" }, 401);
    const { data: conn } = await admin.from("integration_connections").select("id,owner_user_id,settings").eq("org_id", ORG).eq("provider", "google_calendar").eq("status", "connected").maybeSingle();
    if (!conn?.owner_user_id) return json({ ok: true, skipped: "sem_conexao_google" });
    const userId = conn.owner_user_id as string;
    const lastAuto = conn.settings?.auto_sync_at ? new Date(conn.settings.auto_sync_at).getTime() : 0;
    const gtoken = await accessToken(admin, userId);
    const ids: Record<string, string> = { ...(conn.settings?.google_event_ids || {}) };
    const from = new Date(Date.now() - 86400000).toISOString(), to = new Date(Date.now() + 365 * 86400000).toISOString();
    // Agendamento de cliente (inclusive os da Helena em nome da assessora) também vai para a agenda conectada.
    const { data: local, error: localError } = await admin.from("calendar_events").select("*").eq("org_id", ORG).or(`owner_user_id.eq.${userId},client_id.not.is.null,ai_agent_policy_id.not.is.null`).in("event_type", TYPES).gte("starts_at", from).lte("starts_at", to).order("starts_at").limit(300);
    if (localError) throw new Error(`Falha ao ler a agenda: ${localError.message}`);
    // Audiências importadas do tribunal ficam em process_hearings e também precisam ir ao Google.
    const { data: hearings, error: hearingError } = await admin.from("process_hearings").select("*").eq("org_id", ORG).eq("owner_user_id", userId).gte("starts_at", from).lte("starts_at", to).order("starts_at").limit(200);
    if (hearingError) throw new Error(`Falha ao ler audiências: ${hearingError.message}`);
    const all = [...(local || []), ...hearingsToSync(hearings || [], local || [])];
    let pushed = 0, updated = 0, deleted = 0;
    const errors: string[] = [];
    for (const e of all) {
      try {
        let gid = ids[e.id];
        if (e.status === "cancelled") {
          if (gid) {
            const r = await gf(gurl(gid), gtoken, { method: "DELETE" });
            if (r.ok || r.status === 404 || r.status === 410) { delete ids[e.id]; deleted++; }
          }
          continue;
        }
        let d: any = {};
        if (gid) {
          if (new Date(e.updated_at).getTime() <= lastAuto) continue; // já está no Google e não mudou
          const r = await gf(gurl(gid), gtoken, { method: "PATCH", body: JSON.stringify(body(e)) });
          d = await r.json().catch(() => ({}));
          if (r.status === 404 || r.status === 410) gid = "";
          else if (!r.ok) throw new Error(d?.error?.message || `Erro Google ${r.status}`);
          else updated++;
        }
        if (!gid) {
          const r = await gf(gurl(), gtoken, { method: "POST", body: JSON.stringify(body(e)) });
          d = await r.json().catch(() => ({}));
          if (!r.ok || !d.id) throw new Error(d?.error?.message || `Erro Google ${r.status}`);
          ids[e.id] = d.id; pushed++;
        }
        if (e.meeting_mode === "online" && !e.hearing) {
          const meet = String(d?.hangoutLink || d?.conferenceData?.entryPoints?.find((x: any) => x.entryPointType === "video")?.uri || "");
          if (meet) await admin.from("calendar_events").update({ meeting_url: meet, location: meet, updated_at: new Date().toISOString() }).eq("id", e.id);
        }
      } catch (x) { errors.push(`${e.title}: ${x instanceof Error ? x.message : String(x)}`); }
    }
    const at = new Date().toISOString();
    const { data: fresh } = await admin.from("integration_connections").select("settings").eq("id", conn.id).maybeSingle();
    const settings = { ...(fresh?.settings || {}) };
    settings.google_event_ids = { ...(settings.google_event_ids || {}), ...ids };
    for (const k of Object.keys(settings.google_event_ids)) if (!(k in ids) && all.some((l: any) => l.id === k)) delete settings.google_event_ids[k];
    settings.auto_sync_at = at;
    settings.auto_sync_summary = { pushed, updated, deleted, errors: errors.length };
    await admin.from("integration_connections").update({ settings, updated_at: at }).eq("id", conn.id);
    return json({ ok: true, pushed, updated, deleted, errors: errors.slice(0, 5) });
  } catch (e) {
    console.error("google-calendar-autosync", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
