import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import JSZip from "npm:jszip@3.10.1";
import { bodyFingerprint, buildBody, classify, mergeRoles, numberingPatch, originalFingerprint, parseDocument, ROLES } from "./layout.mjs";

// Tipografia → "Formatar peça": recebe o Word da peça e devolve o MESMO texto já no layout oficial do escritório
// (estilos de tipografia, timbrado, quadros e tabelas). A IA só classifica a estrutura e, se pedido, sugere
// quadro-síntese e linha do tempo a partir do próprio texto; ela nunca reescreve a peça.
// v3 (23/11/2026): + gráfico comparativo de valores

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const BUCKET = "legal-review-files";
const MODEL_URL = "https://lexoffice-ashy.vercel.app/timbrado/modelo-peticao.docx";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function context(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const a = admin();
  const { data, error } = await a.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  const { data: p } = await a.from("profiles").select("org_id,status").eq("id", data.user.id).maybeSingle();
  if (!p?.org_id || p.status !== "active") throw new Error("FORBIDDEN");
  return { a, orgId: String(p.org_id), userId: data.user.id };
}

async function geminiKey(a: any, orgId: string) {
  try {
    const { data } = await a.rpc("read_integration_secret", { p_org_id: orgId, p_provider: "gemini_api" });
    const key = String(data || "").trim();
    if (key) return key;
  } catch { /* segue para variável de ambiente */ }
  return (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_GEMINI_API_KEY") || "").trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function gemini(key: string, models: string[], payload: unknown, deadline = Date.now() + 60000) {
  let last: any = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline - Date.now();
      if (left < 15000) return { ok: false as const, status: 504, detail: last?.detail || "tempo esgotado" };
      const r: any = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(left - 5000), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => ({ ok: false, status: 504, json: async () => null }));
      const out = await r.json().catch(() => null);
      if (r.ok) {
        const text = String(out?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "").trim();
        if (text) return { ok: true as const, text, model };
        last = { status: 422, detail: out?.candidates?.[0]?.finishReason || "vazio" };
        break;
      }
      last = { status: r.status, detail: `${model}: ${out?.error?.message || "sem detalhe"}` };
      if (![429, 500, 502, 503, 504].includes(r.status)) break;
      await sleep(900 * (attempt + 1));
    }
  }
  return { ok: false as const, ...last };
}
const parseJson = (raw: string) => {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  return JSON.parse((i >= 0 && j > i ? t.slice(i, j + 1) : t).replace(/,\s*([}\]])/g, "$1"));
};

let modelCache: { bytes: Uint8Array; at: number } | null = null;
async function loadModel() {
  if (modelCache && Date.now() - modelCache.at < 10 * 60 * 1000) return modelCache.bytes;
  const r = await fetch(MODEL_URL, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`modelo de peça indisponível (${r.status})`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  modelCache = { bytes, at: Date.now() };
  return bytes;
}

function prompt(paragraphs: string[], pieceType: string, wantRoles: boolean, wantExtras: boolean) {
  const list = paragraphs.map((t, i) => `[${i}] ${t.slice(0, wantRoles ? 260 : 600)}`).join("\n");
  return `Você é o diagramador de peças jurídicas da Dra. Suzanne Figueiredo. Tipo da peça: ${pieceType}.
Abaixo estão os parágrafos NUMERADOS da peça. NÃO reescreva nada: apenas classifique.
${wantRoles ? `1) "roles": uma lista com exatamente ${paragraphs.length} códigos, um por parágrafo, na ordem. Códigos:
E=endereçamento ao juízo/tribunal; PR=linha "Processo nº"; TP=título da peça (ex.: AÇÃO..., CONTESTAÇÃO...); H1=título de seção principal (ex.: "1. DOS FATOS", "II – DO DIREITO"); H2=subtítulo (ex.: "1.1."); H3=sub-subtítulo; P=parágrafo comum (inclui a qualificação das partes); CIT=citação/ementa/jurisprudência transcrita; PED=item de pedido iniciado por "a)", "b)"...; FE=fecho ("Nestes termos, pede deferimento"); DT=local e data; SL=linha de assinatura; SN=nome de quem assina; SO=linha da OAB.
Na dúvida use P.` : ""}
${wantExtras ? `2) "quadro": síntese da demanda com até 5 linhas [rótulo, texto curto], usando só estes rótulos quando houver base no texto: Objeto, Fato central, Conduta questionada, Prova prioritária, Providências. Cada texto com no máximo 220 caracteres, escrito SOMENTE com o que está no texto. Se faltar base, omita a linha.
3) "linha": linha do tempo com até 10 itens [data, ocorrência, prova ou efeito], em ordem cronológica, usando APENAS datas que aparecem expressamente no texto (formato dd/mm/aaaa quando a peça trouxer assim). Prova/efeito só se o texto citar um documento ou ID; senão deixe "". Se houver menos de 2 datas claras, devolva lista vazia.
4) "graficos": até 2 gráficos comparativos que ajudem o juiz a entender valores em disputa (ex.: valor cobrado x valor apurado pela defesa, composição de um débito). Cada gráfico: {"titulo":"...","barras":[["rótulo curto","valor EXATAMENTE como escrito no texto, ex.: R$ 66.400,00"]]}, com 2 a 6 barras, todas na mesma unidade (R$ ou %). Use SOMENTE valores que aparecem expressamente no texto, copiados com a mesma grafia; não some, não calcule, não arredonde. Se não houver comparação numérica clara, devolva lista vazia.` : ""}
Regras: não invente fatos, datas, valores, nomes nem números; não use informação externa.
Responda SOMENTE JSON: {${wantRoles ? '"roles":[...],' : ""}${wantExtras ? '"quadro":[["Objeto","..."]],"linha":[["dd/mm/aaaa","...","..."]],"graficos":[{"titulo":"...","barras":[["...","R$ 0,00"]]}]' : ""}}

PARÁGRAFOS:
${list}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);
  try {
    const { a, orgId } = await context(req);
    const b = await req.json().catch(() => ({}));
    const path = String(b.path || ""), fileName = String(b.file_name || "peca.docx").slice(0, 240);
    const pieceType = String(b.piece_type || "Petição").slice(0, 80);
    const useAi = b.use_ai !== false, extrasOn = b.extras !== false;
    if (!path.startsWith(`${orgId}/tipografia-entrada/`) || !/\.docx$/i.test(fileName)) return json({ ok: false, error: "Arquivo Word inválido para este escritório." }, 400);

    const { data: input, error: ie } = await a.storage.from(BUCKET).download(path);
    if (ie || !input) return json({ ok: false, error: "Não foi possível abrir a peça enviada." }, 404);
    const original = new Uint8Array(await input.arrayBuffer());
    if (!original.length || original.length > 20 * 1024 * 1024) return json({ ok: false, error: "A peça está vazia ou excede 20 MB." }, 400);
    let inZip: any;
    try { inZip = await JSZip.loadAsync(original); } catch { return json({ ok: false, error: "O arquivo não é um Word (.docx) válido." }, 422); }
    const docXml = await inZip.file("word/document.xml")?.async("text");
    if (!docXml) return json({ ok: false, error: "O Word enviado não possui conteúdo legível." }, 422);

    const { items, images } = parseDocument(docXml);
    const paragraphs = items.filter((i: any) => i.type === "p");
    if (paragraphs.length < 3) return json({ ok: false, error: "Não encontrei texto suficiente na peça para formatar." }, 422);
    const avisos: string[] = [];
    const fn = await inZip.file("word/footnotes.xml")?.async("text").catch(() => "");
    if (fn && (fn.match(/<w:footnote\s/g) || []).length > (fn.match(/w:type="(separator|continuationSeparator)"/g) || []).length) avisos.push("A peça tem notas de rodapé, que não foram transportadas. Reinsira-as no Word.");
    if (images) avisos.push(`A peça tem ${images} imagem(ns). Deixei o aviso "[IMAGEM n — inserir aqui]" no lugar de cada uma; reinsira a imagem no Word antes de protocolar.`);

    // 1) estrutura: regras objetivas + IA (opcional)
    let roles: string[] = classify(items);
    let extras: any = {}; let model = "";
    const wantRoles = paragraphs.length <= 300;
    if (useAi && (wantRoles || extrasOn)) {
      const key = await geminiKey(a, orgId);
      if (key) {
        const models = [...new Set([Deno.env.get("PETITION_MODEL"), Deno.env.get("GEMINI_MODEL"), "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"].map((m) => String(m || "").trim()).filter(Boolean))];
        let texts = paragraphs.map((p: any) => p.text);
        if (!wantRoles) { let tot = 0; texts = texts.filter((t: string) => (tot += Math.min(t.length, 600)) < 60000); }
        const g: any = await gemini(key, models, { contents: [{ role: "user", parts: [{ text: prompt(texts, pieceType, wantRoles, extrasOn) }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 16000, responseMimeType: "application/json" } });
        if (g.ok) {
          try {
            const out = parseJson(g.text); model = g.model;
            if (wantRoles) roles = mergeRoles(roles, Array.isArray(out.roles) ? out.roles.map((r: any) => (ROLES.includes(String(r).toUpperCase()) && String(r).toUpperCase() !== "DS" ? String(r).toUpperCase() : "")) : null);
            if (extrasOn) extras = { quadro: out.quadro, linha: out.linha, graficos: out.graficos };
          } catch { avisos.push("A IA devolveu a estrutura em formato incompleto; formatei só pelas regras do escritório."); }
        } else avisos.push("A IA não respondeu agora; formatei só pelas regras do escritório (sem quadro-síntese e linha do tempo).");
      } else avisos.push("Gemini não está configurado; formatei só pelas regras do escritório.");
    }

    // 2) monta o Word no modelo oficial
    const { body, extraLists, rendered, charts } = buildBody(items, roles, extras);
    if (bodyFingerprint(body) !== originalFingerprint(items)) return json({ ok: false, error: "Por segurança, interrompi a formatação: o texto da peça não ficou idêntico ao original. Nada foi entregue. Tente novamente." }, 500);
    const tpl = await JSZip.loadAsync(await loadModel());
    const docFile = tpl.file("word/document.xml"); const numFile = tpl.file("word/numbering.xml");
    if (!docFile || !numFile) throw new Error("modelo de peça incompleto");
    const tplDoc = await docFile.async("text");
    if (!tplDoc.includes("<!--CORPO-->")) throw new Error("modelo de peça sem marcador de corpo");
    tpl.file("word/document.xml", tplDoc.replace("<!--CORPO-->", () => body));
    const patch = numberingPatch(extraLists);
    if (patch) tpl.file("word/numbering.xml", (await numFile.async("text")).replace("</w:numbering>", () => patch + "</w:numbering>"));
    const bytes = await tpl.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    const stem = fileName.replace(/\.docx$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const outPath = `${orgId}/tipografia-saida/${crypto.randomUUID()}-${stem}-FORMATADA.docx`;
    const { error: ue } = await a.storage.from(BUCKET).upload(outPath, new Blob([bytes], { type: DOCX_MIME }), { contentType: DOCX_MIME, upsert: false });
    if (ue) throw new Error(`O Word foi montado, mas não pôde ser salvo: ${ue.message}`);
    const { data: signed } = await a.storage.from(BUCKET).createSignedUrl(outPath, 900, { download: `${stem}-FORMATADA.docx` });
    const count = (c: string) => roles.filter((r) => r === c).length;
    const gerados: string[] = [];
    if (Array.isArray(extras.quadro) && extras.quadro.length) gerados.push("quadro-síntese");
    if (Array.isArray(extras.linha) && extras.linha.length >= 2 && body.includes("Linha do tempo documentada")) gerados.push("linha do tempo");
    if (charts) gerados.push(charts > 1 ? "gráficos comparativos" : "gráfico comparativo");
    if (gerados.length) avisos.push(`Confira o que a IA montou a partir do texto: ${gerados.join(" e ")}. Se algo não estiver certo, apague o bloco no Word.`);
    return json({ ok: true, url: signed?.signedUrl || null, avisos, gerados, imagens: images, tabelas: items.filter((i: any) => i.type === "tbl").length, paragrafos: rendered, titulos: count("H1") + count("H2") + count("H3"), pedidos: count("PED"), model: model || null });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Erro inesperado.";
    if (m === "UNAUTHORIZED") return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);
    if (m === "FORBIDDEN") return json({ ok: false, error: "Sem permissão." }, 403);
    console.error("typography-format", e);
    return json({ ok: false, error: `Não foi possível formatar a peça agora: ${m}` }, 500);
  }
});
