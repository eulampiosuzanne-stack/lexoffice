import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2";
import {mapWahaStatus, normalizeWahaUrl, pickEngine, pickWahaSession} from "./state.ts";

// Somente leitura: pergunta ao WAHA se a sessão do WhatsApp do escritório (4141) está no ar.
// Não altera banco, não envia mensagem e não devolve chaves.
const h = {"Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type", "Access-Control-Allow-Methods": "POST,OPTIONS"};
const J = (x: unknown, s = 200) => new Response(JSON.stringify(x), {status: s, headers: h});

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", {headers: h});
  if (req.method !== "POST") return J({error: "method_not_allowed"}, 405);
  const bearer = req.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) return J({error: "unauthorized"}, 401);
  const u = Deno.env.get("SUPABASE_URL")!, a = Deno.env.get("SUPABASE_ANON_KEY")!, s = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = createClient(u, a, {global: {headers: {Authorization: bearer}}});
  const {data: {user}, error} = await auth.auth.getUser();
  if (error || !user) return J({error: "unauthorized"}, 401);
  const db = createClient(u, s, {auth: {persistSession: false}});
  const {data: p} = await db.from("profiles").select("org_id,role_key,status").eq("id", user.id).maybeSingle();
  if (!p?.org_id || p.status === "inactive" || !["owner", "admin", "super_admin", "master"].includes(String(p.role_key || "").toLowerCase())) return J({error: "administrator_required"}, 403);

  const {data: rows} = await db.from("integration_connections").select("status,settings,updated_at")
    .eq("org_id", p.org_id).eq("provider", "whatsapp")
    .filter("settings->>provider", "eq", "waha").filter("settings->>channel_enabled", "eq", "true")
    .order("updated_at", {ascending: false}).limit(5);
  const session = pickWahaSession(rows || []);
  if (!session) return J({ok: false, error: "waha_not_configured"}, 404);

  const base = normalizeWahaUrl(Deno.env.get("WAHA_API_URL") || "https://lexoffice-waha-production.up.railway.app");
  const key = (Deno.env.get("WAHA_API_KEY") || "").trim();
  if (!base || !key) return J({ok: false, error: "waha_server_configuration_invalid"}, 503);

  try {
    const r = await fetch(base + "/api/sessions/" + encodeURIComponent(session), {headers: {"X-Api-Key": key}, redirect: "error", signal: AbortSignal.timeout(10000)});
    if (!r.ok) return J({ok: false, error: "waha_request_failed", http_status: r.status}, 502);
    const d = await r.json().catch(() => null);
    const state = mapWahaStatus(d?.status);
    return J({ok: true, provider: "waha", state, connected: state === "connected", session_name: session, engine: pickEngine(d)});
  } catch {
    return J({ok: false, error: "waha_request_failed"}, 502);
  }
});
