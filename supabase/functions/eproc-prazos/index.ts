// Robô de PRAZOS do eproc TJMG (pedido da Dra. Suzanne, 27/11/2026).
// Lê só a lista de intimações com prazo ABERTO (não abre nada pendente de ciência) e grava a data oficial na LEX.
// Divide a trava de acesso com o tjmg-mni-connector (10 min entre entradas; para em senha/2FA/captcha).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Browser, decodeEntities, EprocStop, formFields, login, logout, menuLinks, text } from "./eproc.ts";
import { parsePrazos, Prazo, rowCells } from "./parse.ts";

const OWNER_ORG = "b3dd3ed0-2a05-4087-8220-307a44352cec";
const OWNER_USER = "0e98483f-a464-422b-bf3e-68f454cdd405";
const LIST = "citacao_intimacao_prazo_aberto_listar";
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

// Só na prévia: mostra o formato das telas (listagens, só leitura) para ajustar a leitura.
function formato(h: string) {
  const visivel = text(h);
  const i = visivel.search(/Lista de|Nenhum/i);
  const m = h.search(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
  return {
    titulo: text((h.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || ""), tamanho: h.length,
    legenda: text((h.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i) || [])[1] || ""),
    colunas: [...h.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((x) => text(x[1])).slice(0, 20),
    classes_tr: [...new Set([...h.matchAll(/<tr\b[^>]*class=["']([^"']+)/gi)].map((x) => x[1]))].slice(0, 10),
    formularios: [...h.matchAll(/<form\b[^>]*\bid=["']([^"']+)/gi)].map((x) => x[1]),
    campos: [...new Set([...h.matchAll(/<(?:input|select|button)\b[^>]*(?:name|id)=["']([^"']+)/gi)].map((x) => x[1]))].slice(0, 60),
    trecho: visivel.slice(Math.max(0, i), Math.max(0, i) + 900),
    html_linha: m >= 0 ? h.slice(Math.max(0, m - 700), m + 1800).replace(/hash=[a-f0-9]+/gi, "hash=x") : "",
    linhas: rowCells(h).slice(0, 4).map((c) => c.map((x) => x.slice(0, 160))),
  };
}
const semHash = (u: string) => u.replace(/hash=[a-f0-9]+/gi, "").replace(/controlador\.php\?acao=/, "");
const hrefs = (h: string) => [...h.matchAll(/(?:href|data-url)=["']([^"']*controlador\.php\?acao=[^"']+)["']/gi)].map((m) => decodeEntities(m[1]))
  .concat([...h.matchAll(/location(?:\.href)?\s*=\s*['"]([^'"]*controlador\.php\?acao=[^'"]+)['"]/gi)].map((m) => decodeEntities(m[1])));

// O menu tem vários atalhos para a lista de prazos (o primeiro é só "vence hoje"): junta todos, também do painel do advogado.
async function acharListas(b: Browser, home: string, links: Record<string, string>) {
  let painel = "";
  if (links["painel_adv_listar"]) { try { painel = await b.go(links["painel_adv_listar"]); } catch { /* segue com a página inicial */ } }
  const todos = [...hrefs(home), ...hrefs(painel)];
  const listas = [...new Map(todos.filter((u) => u.includes(`acao=${LIST}&`)).map((u) => [semHash(u), u])).values()];
  const completas = listas.filter((u) => !/vence_hoje=S/i.test(u));
  const atalhos = [...new Set(todos.map(semHash).filter((u) => /citac|intimac|prazo|painel|audienc/i.test(u)))].slice(0, 60);
  return { usar: (completas.length ? completas : listas).slice(0, 6), soHoje: !completas.length, atalhos, painel: painel ? formato(painel) : null };
}

// Só abre LISTAS de intimação, citação, prazo e audiência. Nunca abre item, documento ou processo (isso pode dar ciência).
const ABA = /^(citacao|intimacao|audiencia)[a-z_]*listar[a-z_]*$/;
const PROIBIDO = /ciencia|confirm|abrir|receb|peticion|cancelar|excluir|gerar|assinar/;
async function varrerAbas(b: Browser, home: string, links: Record<string, string>) {
  let painel = "";
  if (links["painel_adv_listar"]) { try { painel = await b.go(links["painel_adv_listar"]); } catch { /* segue */ } }
  const urls = new Map<string, string>();
  for (const u of [...hrefs(painel), ...hrefs(home), ...Object.values(links)]) {
    const acao = (u.match(/acao=([a-zA-Z0-9_]+)/) || [])[1] || "";
    if (ABA.test(acao) && !PROIBIDO.test(u.replace(/hash=[a-f0-9]+/gi, ""))) urls.set(semHash(u), u);
  }
  const abas: Record<string, unknown> = {};
  for (const [nome, u] of [...urls].slice(0, 16)) {
    try {
      const h = await b.go(u), f = formato(h);
      abas[nome] = { titulo: f.titulo, legenda: f.legenda || (text(h).match(/Lista de[^\n]{0,80}/) || [""])[0], colunas: f.colunas, linhas: rowCells(h).length, amostra: rowCells(h).slice(0, 3).map((c) => c.map((x) => x.slice(0, 100))), html_linha: f.html_linha.slice(0, 900) };
    } catch (e) { abas[nome] = { erro: e instanceof Error ? e.message : String(e) }; }
  }
  return { achadas: urls.size, abas, painel_trecho: painel ? text(painel).replace(/[\s\S]*?Painel/i, "Painel").slice(0, 1800) : null };
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
    const prazos: Prazo[] = [], naoLidas: string[][] = [], paginas: unknown[] = [];
    let total = 0, completo = true, telas: unknown;
    try {
      const links = menuLinks(html);
      const achadas = await acharListas(b, html, links);
      if (!achadas.usar.length) throw new EprocStop("tela_mudou", "A lista de prazos em aberto não apareceu no menu do eproc.");
      const chave = (p: Prazo) => `${p.cnj}|${p.envio}|${p.evento}|${p.final}`;
      for (const url of achadas.usar) {
        const l = await lerPrazos(b, url);
        for (const p of l.prazos) if (!prazos.some((q) => chave(q) === chave(p))) prazos.push(p);
        naoLidas.push(...l.naoLidas);
        if (l.total < 0 || l.naoLidas.length || l.prazos.length < l.total) completo = false;
        total += Math.max(0, l.total);
        if (action === "preview") paginas.push({ url: semHash(url), total: l.total, lidos: l.prazos.length, tela: l.prazos.length ? null : formato(l.primeira) });
      }
      if (achadas.soHoje) completo = false;
      if (action === "preview") telas = { so_vence_hoje: achadas.soHoje, atalhos: achadas.atalhos, menus: Object.keys(links).filter((k) => /citac|intimac|prazo|audienc|painel|movim/i.test(k)), paginas, varredura: await varrerAbas(b, html, links) };
    } finally { await logout(b, html); }
    const contagem = { total_no_eproc: total, lidos: prazos.length, nao_lidos: naoLidas.length, completo };
    if (action === "preview") {
      await log(db, "success", `Prévia de prazos do eproc: ${prazos.length} lidos de ${total}.`, { code: "ok", ...contagem });
      return respond({ ok: true, ...contagem, rows: prazos, linhas_nao_lidas: naoLidas.slice(0, 5), telas });
    }
    const { data: resumo, error } = await db.rpc("lex_apply_eproc_deadlines", { p_org: OWNER_ORG, p_owner: OWNER_USER, p_rows: prazos });
    if (error) throw new Error("Falha ao gravar os prazos: " + error.message);
    await db.rpc("lex_eproc_deadline_alerts", { p_org: OWNER_ORG, p_owner: OWNER_USER });
    if (!completo) await notify(db, "Conferir prazos no eproc", `O robô leu ${prazos.length} de ${total || "?"} prazos abertos. Confira a lista no eproc.`);
    await log(db, completo ? "success" : "error", `Prazos do eproc: ${prazos.length} de ${total} lidos, ${resumo.novos} novo(s).`, { code: completo ? "ok" : "incompleto", ...contagem, ...resumo });
    return respond({ ok: true, ...contagem, ...resumo });
  } catch (e) {
    const code = e instanceof EprocStop ? e.code : "erro";
    const msg = e instanceof Error ? e.message : String(e);
    if (code !== "aguarde" && code !== "travado") await log(db, "error", msg, { code });
    // Falha nunca pode ser silenciosa: a Dra. precisa saber que deve olhar o eproc.
    if (action === "sync" && code !== "aguarde") await notify(db, "Robô de prazos falhou — confira o eproc", msg);
    return respond({ ok: false, code, error: msg }, code === "aguarde" || code === "travado" ? 429 : 502);
  }
});
