// Robô eproc TJSP — etapa 1: situação e teste de entrada. Não lê nem grava processos.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { EprocStop, login, logout, menuLinks } from "./eproc.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-sync-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (n: string) => (Deno.env.get(n) || "").trim();
const OWNER_ORG = "b3dd3ed0-2a05-4087-8220-307a44352cec";
const OWNER_USER = "0e98483f-a464-422b-bf3e-68f454cdd405";
const EVENT = "eproc_tjsp_robo";

// Só o agendador do banco ou alguém do próprio escritório da Dra.
async function caller(req: Request) {
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const tok = req.headers.get("x-sync-token") || "";
  if (tok) {
    const { data } = await db.from("system_runtime_secrets").select("secret").eq("key", "datajud_sync_token").maybeSingle();
    if (data?.secret && tok === String(data.secret).trim()) return db;
  }
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Não autenticado");
  const { data } = await db.auth.getUser(auth.slice(7));
  if (!data?.user) throw new Error("Não autenticado");
  const { data: p } = await db.from("profiles").select("org_id").eq("id", data.user.id).maybeSingle();
  if (p?.org_id !== OWNER_ORG) throw new Error("Não autorizado");
  return db;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ ok: false, error: "Método inválido" }, 405);
  let db: Awaited<ReturnType<typeof caller>>;
  try { db = await caller(req); } catch (e) { return respond({ ok: false, error: (e as Error).message }, 401); }
  const action = String((await req.json().catch(() => ({})))?.action || "status");
  // Usuário e senha são os mesmos do TJMG (informado pela Dra.); a chave 2FA é própria do TJSP.
  const user = env("EPROC_TJSP_USUARIO") || env("EPROC_TJMG_USUARIO");
  const pass = env("EPROC_TJSP_SENHA") || env("EPROC_TJMG_SENHA");
  const seed = env("EPROC_TJSP_2FA");
  const configured = { usuario: !!user, senha: !!pass, segundo_fator: !!seed };
  const { data: last } = await db.from("tribunal_sync_logs").select("status,message,created_at,payload").eq("org_id", OWNER_ORG).eq("event_type", EVENT).order("created_at", { ascending: false }).limit(1);
  if (action === "status") return respond({ ok: true, provider: "eproc_tjsp", configured, last_run: last?.[0] || null });
  if (action !== "eproc_login_test") return respond({ ok: false, error: "Ação não suportada" }, 400);
  if (!user || !pass || !seed) return respond({ ok: false, configured, error: "Faltam segredos no cofre do Supabase." }, 409);

  // Uma tentativa a cada 10 minutos, para não bloquear a conta no eproc.
  if (last?.[0] && Date.now() - new Date(last[0].created_at).getTime() < 600000) return respond({ ok: false, code: "aguarde", error: "Aguarde 10 minutos entre tentativas." }, 429);
  const log = (status: string, message: string, payload: Record<string, unknown>) =>
    db.from("tribunal_sync_logs").insert({ org_id: OWNER_ORG, owner_user_id: OWNER_USER, event_type: EVENT, status, message: message.slice(0, 500), payload });
  try {
    const { b, html } = await login(user, pass, seed);
    const links = menuLinks(html);
    await logout(b, html);
    await log("success", "Login de teste no eproc TJSP concluído.", { code: "ok", menus: Object.keys(links).length });
    return respond({ ok: true, logged_in: true, menus_encontrados: Object.keys(links).length, tem_relacao_processos: !!links["relatorio_processo_procurador_listar"] });
  } catch (e) {
    const code = e instanceof EprocStop ? e.code : "erro";
    const msg = e instanceof Error ? e.message : String(e);
    await log("error", msg, { code });
    return respond({ ok: false, code, error: msg }, 502);
  }
});
