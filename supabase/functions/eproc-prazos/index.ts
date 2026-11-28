// Robô de PRAZOS do eproc TJMG (pedido da Dra. Suzanne, 27/11/2026).
// Lê só LISTAS (prazos abertos, pendentes e audiências futuras). Nunca abre item pendente de ciência.
// Divide a trava de acesso com o tjmg-mni-connector (10 min entre entradas; para em senha/2FA/captcha).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Browser, decodeEntities, EprocStop, formFields, login, logout, menuLinks, text } from "./eproc.ts";
import { Audiencia, parseAudiencias, parsePendentes, parsePrazos, Pendente, Prazo, rowCells } from "./parse.ts";

const OWNER_ORG = "b3dd3ed0-2a05-4087-8220-307a44352cec";
const OWNER_USER = "0e98483f-a464-422b-bf3e-68f454cdd405";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-sync-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (n: string) => (Deno.env.get(n) || "").trim();
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

async function authorized(req: Request, db: any) {
  const tok = req.headers.get("x-sync-token") || "";
  if (tok) {
    const { data } = await db.from("system_runtime_secrets").select("secret").eq("key", "datajud_sync_token").maybeSingle();
    if (data?.secret && tok === String(data.secret).trim()) return true;
  }
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const { data } = await db.auth.getUser(auth.slice(7));
  if (!data?.user) return false;
  const { data: p } = await db.from("profiles").select("org_id,role_key,status").eq("id", data.user.id).maybeSingle();
  return p?.org_id === OWNER_ORG && p.status === "active" && ["owner", "lawyer"].includes(p.role_key);
}

const log = (db: any, status: string, message: string, payload: Record<string, unknown>) =>
  db.from("tribunal_sync_logs").insert({ org_id: OWNER_ORG, owner_user_id: OWNER_USER, event_type: "eproc_tjmg_robo", status, message: message.slice(0, 500), payload: { ...payload, robo: "prazos" } });
const notify = (db: any, title: string, body: string) =>
  db.from("notifications").insert({ org_id: OWNER_ORG, user_id: OWNER_USER, type: "deadline", title, body: body.slice(0, 500), link: "/agenda", read: false });

async function guard(db: any) {
  const { data } = await db.from("tribunal_sync_logs").select("created_at,payload").eq("org_id", OWNER_ORG).eq("event_type", "eproc_tjmg_robo").order("created_at", { ascending: false }).limit(1);
  const last = data?.[0];
  if (!last) return;
  if (["senha_recusada", "2fa_recusado", "captcha"].includes(String(last.payload?.code || ""))) throw new EprocStop("travado", "Robô pausado: o eproc recusou a última entrada.");
  if (Date.now() - new Date(last.created_at).getTime() < 10 * 60000) throw new EprocStop("aguarde", "Última entrada há menos de 10 minutos.");
}

async function lerPrazos(b: Browser, url: string) {
  let html = await b.go(url);
  const primeira = html;
  const first = parsePrazos(html);
  const prazos: Prazo[] = first.prazos, naoLidas = first.naoLidas;
  const total = Number((text(html).match(/\((\d+)\s+registros?/i) || [])[1] ?? -1);
  for (let page = 1; total > prazos.length + naoLidas.length && page < 30; page++) {
    const id = [...html.matchAll(/<form\b[^>]*\bid=["']([^"']+)["'][\s\S]*?<\/form>/gi)].find((m) => m[0].includes("hdnInfraPaginaAtual"))?.[1];
    const f = id ? formFields(html, id) : null;
    if (!f) break;
    html = await b.go(f.action || url, { ...f.fields, hdnInfraPaginaAtual: String(page) });
    const more = parsePrazos(html);
    const chave = (p: Prazo) => `${p.cnj}|${p.envio}|${p.evento}|${p.final}`;
    const novas = more.prazos.filter((p) => !prazos.some((q) => chave(q) === chave(p)));
    if (!novas.length) break;
    prazos.push(...novas); naoLidas.push(...more.naoLidas);
  }
  return { prazos, naoLidas, total, primeira };
}

const hrefs = (h: string) => [...h.matchAll(/(?:href|data-url)=["']([^"']*controlador\.php\?acao=[^"']+)["']/gi)].map((m) => decodeEntities(m[1]))
  .concat([...h.matchAll(/location(?:\.href)?\s*=\s*['"]([^'"]*controlador\.php\?acao=[^'"]+)['"]/gi)].map((m) => decodeEntities(m[1])));


// Os números do "Painel do Advogado" (e os links das listas) chegam numa segunda chamada, em JSON, depois que a página abre.
type Painel = { estado: string; links: Record<string, string>; n: Record<string, string> };
async function lerPainel(b: Browser, home: string) {
  const urls = [...new Set([...home.matchAll(/data-urlassinadacarregamento=["']([^"']*acao_ajax=retornar_citacao_intimacao_estado[^"']*)["']/gi)].map((m) => decodeEntities(m[1])))];
  const base = b.last, paineis: Painel[] = [], falhas: string[] = [];
  for (const u of urls) {
    const estado = (u.match(/estado=([A-Z]+)/) || [])[1] || "?";
    try {
      const j = JSON.parse(await b.go(new URL(u, base).toString()));
      for (const x of j?.usuarios || []) if (x?.links && x?.resultados) paineis.push({ estado, links: x.links, n: x.resultados });
    } catch { falhas.push(estado); }
  }
  b.last = base;
  return { paineis, falhas };
}

const num = (v: unknown) => Number(v || 0) || 0;
async function lerTudo(b: Browser, home: string) {
  // Audiências primeiro: depois de visitar o 2º grau os cookies mudam e o 1º grau devolve página genérica.
  const prazos: Prazo[] = [], naoLidas: string[][] = [], pendentes: Pendente[] = [], audiencias: Audiencia[] = [], telasAud: unknown[] = [], avisos: string[] = [];
  const inicio = b.last;
  for (const acao of ["audiencia_futura_listar", "audiencia_futura_conciliacao_listar"]) {
    const u = menuLinks(home)[acao];
    if (!u) { avisos.push("lista de audiências não apareceu"); continue; }
    try {
      const h = await b.go(new URL(u, inicio).toString()), achadas = parseAudiencias(h), total = Number((text(h).match(/\((\d+)\s+registros?/i) || [])[1] ?? 0);
      telasAud.push({ acao, total, lidas: achadas.length, titulo: text((h.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || ""), amostra: rowCells(h).slice(0, 2).map((c) => c.map((x) => x.slice(0, 90))) });
      if (!/audi[eê]nc/i.test(text((h.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || ""))) avisos.push("lista de audiências não abriu");
      else if (achadas.length < total) avisos.push(`audiências: ${achadas.length} de ${total} lidas`);
      for (const a of achadas) if (!audiencias.some((q) => q.cnj === a.cnj && q.inicio === a.inicio)) audiencias.push(a);
    } catch { avisos.push("lista de audiências não abriu"); }
  }
  b.last = inicio;
  const { paineis, falhas } = await lerPainel(b, home);
  avisos.push(...falhas.map((e) => `painel ${e} não carregou`));
  if (!paineis.some((p) => p.estado === "MG")) throw new EprocStop("tela_mudou", "O painel de intimações do eproc não carregou.");
  let esperados = 0, pendEsperados = 0;
  const base = b.last;
  const abrir = (u: string) => new URL(decodeEntities(u), base).toString();
  for (const p of paineis) {
    const abertos = num(p.n.numCitacaoIntimacaoAberto), pend = num(p.n.numCitacaoIntimacaoPendente);
    esperados += abertos; pendEsperados += pend;
    if (num(p.n.numCitacaoArt334Pendente)) avisos.push(`há citação do art. 334 pendente (${p.estado})`);
    try {
      if (abertos && p.links.intimacaoAberto) { const l = await lerPrazos(b, abrir(p.links.intimacaoAberto)); prazos.push(...l.prazos); naoLidas.push(...l.naoLidas); }
      // Só a LISTA das pendentes. Nunca abre item, documento ou processo (isso daria ciência).
      if (pend && p.links.intimacaoPendente) pendentes.push(...parsePendentes(await b.go(abrir(p.links.intimacaoPendente))));
    } catch { avisos.push(`lista de ${p.estado} não abriu`); }
  }
  if (pendentes.length < pendEsperados) avisos.push(`pendentes: ${pendentes.length} de ${pendEsperados} lidas`);
  return { prazos, naoLidas, pendentes, audiencias, telasAud, avisos, esperados, completo: prazos.length >= esperados && !naoLidas.length };
}

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function avisarPendentes(db: any, pendentes: Pendente[]) {
  let novas = 0;
  for (const p of pendentes) {
    const body = `${p.cnj} — ${p.evento}${p.envio ? ` — enviada em ${quando(p.envio)}` : ""}. O prazo ainda não começou.`.slice(0, 500);
    const { data } = await db.from("notifications").select("id").eq("user_id", OWNER_USER).eq("body", body).limit(1);
    if (!data?.length) { await notify(db, "Intimação nova no eproc (aguardando)", body); novas++; }
  }
  return novas;
}

// Audiência entra na agenda SEM cliente/processo vinculado: assim o app do cliente não recebe aviso automático.
async function gravarAudiencias(db: any, lista: Audiencia[]) {
  let novas = 0;
  for (const a of lista) {
    const title = `[AUDIÊNCIA eproc] ${a.cnj}`;
    const { data, error: e1 } = await db.from("calendar_events").select("id").eq("org_id", OWNER_ORG).eq("title", title).eq("starts_at", a.inicio).limit(1);
    if (e1) throw new Error("Falha ao conferir a agenda: " + e1.message);
    if (data?.length) continue;
    const { error } = await db.from("calendar_events").insert({ org_id: OWNER_ORG, owner_user_id: OWNER_USER, title, event_type: "hearing", status: "scheduled", priority: "high", starts_at: a.inicio, location: a.sala || null, description: `${a.evento}\nSala/acesso: ${a.sala}\nLido da lista de audiências do eproc.` });
    if (error) throw new Error("Falha ao gravar audiência: " + error.message);
    novas++;
  }
  return novas;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ ok: false, error: "Método inválido" }, 405);
  const db = admin();
  if (!(await authorized(req, db))) return respond({ ok: false, error: "Não autenticado" }, 401);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "sync");
  if (!["sync", "preview"].includes(action)) return respond({ ok: false, error: "Ação não suportada" }, 400);
  const user = env("EPROC_TJMG_USUARIO"), pass = env("EPROC_TJMG_SENHA"), seed = env("EPROC_TJMG_2FA");
  if (!user || !pass || !seed) return respond({ ok: false, error: "Faltam os segredos do eproc no Supabase." }, 409);
  try {
    await guard(db);
    const { b, html } = await login(user, pass, seed);
    let lido;
    try { lido = await lerTudo(b, html); } finally { await logout(b, html); }
    const { prazos, naoLidas, pendentes, audiencias, telasAud, avisos, completo } = lido;
    const total = lido.esperados;
    const contagem = { total_no_eproc: total, lidos: prazos.length, nao_lidos: naoLidas.length, completo, pendentes: pendentes.length, audiencias: audiencias.length, avisos, telas_audiencia: telasAud };
    if (action === "preview") {
      await log(db, "success", `Prévia de prazos do eproc: ${prazos.length} lidos de ${total}.`, { code: "ok", ...contagem });
      return respond({ ok: true, ...contagem, rows: prazos, linhas_nao_lidas: naoLidas.slice(0, 5), lista_pendentes: pendentes, lista_audiencias: audiencias });
    }
    const { data: resumo, error } = await db.rpc("lex_apply_eproc_deadlines", { p_org: OWNER_ORG, p_owner: OWNER_USER, p_rows: prazos });
    if (error) throw new Error("Falha ao gravar os prazos: " + error.message);
    await db.rpc("lex_eproc_deadline_alerts", { p_org: OWNER_ORG, p_owner: OWNER_USER });
    const pendentes_novas = await avisarPendentes(db, pendentes);
    const audiencias_novas = await gravarAudiencias(db, audiencias);
    if (!completo || avisos.length) await notify(db, "Conferir no eproc", `Prazos: ${prazos.length} de ${total} lidos. ${avisos.join("; ")}`);
    await log(db, completo ? "success" : "error", `Prazos do eproc: ${prazos.length} de ${total} lidos, ${resumo.novos} novo(s).`, { code: completo ? "ok" : "incompleto", ...contagem, ...resumo, pendentes_novas, audiencias_novas });
    return respond({ ok: true, ...contagem, ...resumo, pendentes_novas, audiencias_novas });
  } catch (e) {
    const code = e instanceof EprocStop ? e.code : "erro";
    const msg = e instanceof Error ? e.message : String(e);
    if (code !== "aguarde" && code !== "travado") await log(db, "error", msg, { code });
    // Falha nunca pode ser silenciosa: a Dra. precisa saber que deve olhar o eproc.
    if (action === "sync" && code !== "aguarde") await notify(db, "Robô de prazos falhou — confira o eproc", msg);
    return respond({ ok: false, code, error: msg }, code === "aguarde" || code === "travado" ? 429 : 502);
  }
});
