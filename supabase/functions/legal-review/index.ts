import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import JSZip from "npm:jszip@3.10.1";

// Revisão da Peça (Simulador do Adversário, Jurisprudência, Prova × Pedido, Raio-X do Protocolo, Tipografia).
// Função própria: Gemini com vários modelos e, se estiver sobrecarregado, plano B no Claude (ANTHROPIC_API_KEY).
// Não altera a petition-assistant. v1 (23/11/2026)

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

const FOCUS: Record<string, string> = {
  "Tipografia": "Avalie legibilidade, hierarquia, parágrafos, tabelas, densidade, consistência formal e padrão visual. Em DOCX, declare o que ainda depende de conferência visual no Word.",
  "Simulador do Adversário": "Atue como advogado da parte contrária: preliminares, impugnações, versões alternativas, ataques às provas e aos pedidos; depois indique como antecipar cada defesa.",
  "Jurisprudência": "Extraia teses que precisam de apoio e termos de pesquisa. Nunca invente julgados, números, relatorias, súmulas ou citações.",
  "Prova × Pedido": "Relacione cada pedido aos fatos, provas existentes, lacunas probatórias e risco de indeferimento.",
  "Raio-X do Protocolo": "Revise competência, partes, fatos, fundamentos, pedidos, tutela, valor da causa, provas, anexos, coerência, riscos e itens impeditivos do protocolo.",
};

const xmlDecode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
function toBase64(bytes: Uint8Array) { let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function parseJson(raw: string) {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  const src = (i >= 0 && j > i ? t.slice(i, j + 1) : t).replace(/^\uFEFF/, "");
  try { return JSON.parse(src); } catch { return JSON.parse(src.replace(/,\s*([}\]])/g, "$1")); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geminiKey(a: any, orgId: string) {
  try { const { data } = await a.rpc("read_integration_secret", { p_org_id: orgId, p_provider: "gemini_api" }); const k = String(data || "").trim(); if (k) return k; } catch { /* env */ }
  return (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_GEMINI_API_KEY") || "").trim();
}

async function geminiOnly(key: string, models: string[], payload: unknown, deadline: number) {
  let last = { status: 503, detail: "Provedor indisponível" };
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline - Date.now();
      if (left < 12000) return { ok: false as const, ...last };
      let status = 504;
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(Math.min(30000, left - 5000)), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        status = r.status;
        const out = await r.json().catch(() => null);
        if (r.ok) {
          const text = String(out?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "").trim();
          if (text) return { ok: true as const, text, model };
          last = { status: 422, detail: `${model}: resposta vazia` }; break;
        }
        last = { status, detail: `${model}: ${out?.error?.message || "indisponível"}` };
      } catch (e) { last = { status: 504, detail: `${model}: falha de conexão (${e instanceof Error ? e.name : "erro"})` }; }
      if (![429, 500, 502, 503, 504].includes(status)) break;
      await sleep(900 * (attempt + 1));
    }
  }
  return { ok: false as const, ...last };
}

// Plano B: Claude. Só texto (sem PDF anexo), porque o corpo vai como texto.
async function claude(prompt: string, deadline: number) {
  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  const left = deadline - Date.now();
  if (!apiKey || left < 20000) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(left - 3000),
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: Deno.env.get("CLAUDE_FALLBACK_MODEL") || "claude-sonnet-5-5", max_tokens: 8192, temperature: 0.1, messages: [{ role: "user", content: prompt + "\n\nResponda SOMENTE com o JSON pedido, sem texto antes ou depois." }] }),
    });
    const out: any = await r.json().catch(() => null);
    if (!r.ok) return null;
    const text = String((out?.content || []).map((b: any) => b?.text || "").join("")).trim();
    return text ? { ok: true as const, text, model: "claude" } : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método inválido" }, 405);
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error: "Sessão inválida." }, 401);
    const a = admin();
    const { data: u, error: ue } = await a.auth.getUser(token);
    if (ue || !u.user) return json({ ok: false, error: "Sessão inválida." }, 401);
    const { data: p } = await a.from("profiles").select("org_id,status").eq("id", u.user.id).maybeSingle();
    if (!p?.org_id || p.status !== "active") return json({ ok: false, error: "Sem permissão." }, 403);
    const orgId = String(p.org_id);

    const b = await req.json().catch(() => ({}));
    const tab = String(b.tab || ""), path = String(b.file_path || ""), reviewId = String(b.review_id || "");
    const fileName = String(b.file_name || path.split("/").pop() || "peça");
    if (!FOCUS[tab]) return json({ ok: false, error: "Módulo de revisão inválido." }, 400);
    if (!path.startsWith(`${orgId}/`)) return json({ ok: false, error: "Arquivo inválido para este escritório." }, 403);
    const { data: input, error: ie } = await a.storage.from("legal-review-files").download(path);
    if (ie || !input) return json({ ok: false, error: "Não foi possível abrir o arquivo privado para análise." }, 404);
    const bytes = new Uint8Array(await input.arrayBuffer());
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) return json({ ok: false, error: "O arquivo está vazio ou excede 20 MB." }, 400);
    const isPdf = /\.pdf$/i.test(fileName) || input.type === "application/pdf";

    const prompt = `Você é revisor(a) jurídico(a) sênior brasileiro(a) da LexOffice. Analise a peça no módulo "${tab}".\nFOCO: ${FOCUS[tab]}\nREGRAS: use somente o conteúdo lido; nunca invente fatos, provas, legislação, jurisprudência, notas ou dados processuais; quando algo não puder ser confirmado, diga "não confirmado"; diferencie impedimento, risco e melhoria; a nota de 0 a 100 mede a prontidão neste foco e deve ser justificada.\nResponda SOMENTE JSON válido: {"score":0,"status":"apto|apto_com_ajustes|nao_apto","summary":"","blocking_issues":[{"title":"","detail":"","evidence":""}],"risks":[{"title":"","detail":"","evidence":""}],"strengths":[{"title":"","detail":"","evidence":""}],"recommendations":[{"priority":"alta|media|baixa","action":"","reason":""}],"proof_request_matrix":[{"request":"","supporting_facts":"","existing_evidence":"","missing_evidence":"","risk":""}],"jurisprudence_queries":[{"thesis":"","search_terms":"","source":"TJMG|STJ|STF|outra"}],"limitations":[""]}`;
    const parts: any[] = [{ text: prompt }];
    let plainText = "";
    if (isPdf) parts.push({ inline_data: { mime_type: "application/pdf", data: toBase64(bytes) } });
    else {
      let xml: string | undefined;
      try { xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")?.async("text"); } catch { return json({ ok: false, error: "O arquivo não é um Word (.docx) válido." }, 422); }
      plainText = xml ? xmlDecode(xml.replace(/<w:tab\/?\s*>/g, "\t").replace(/<w:br\/?\s*>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n")).trim() : "";
      if (plainText.length < 40) return json({ ok: false, error: "Não foi possível extrair texto suficiente do DOCX." }, 422);
      parts.push({ text: `\nCONTEÚDO DA PEÇA:\n${plainText.slice(0, 120000)}` });
    }

    const key = await geminiKey(a, orgId);
    const hasClaude = !!(Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!key && !(hasClaude && plainText)) return json({ ok: false, error: "Google Gemini não está configurado em Integrações." }, 503);
    const models = [...new Set([Deno.env.get("PETITION_MODEL"), Deno.env.get("GEMINI_MODEL"), "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"].map((m) => String(m || "").trim()).filter(Boolean))];
    const start = Date.now(), deadline = start + 135000;
    const payload = { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" } };
    let g: any = key ? await geminiOnly(key, models, payload, plainText && hasClaude ? Math.min(deadline, start + 60000) : deadline) : { ok: false, status: 503, detail: "Gemini não configurado" };
    if (!g.ok && plainText && hasClaude) { const c = await claude(prompt + `\n\nCONTEÚDO DA PEÇA:\n${plainText.slice(0, 120000)}`, deadline); if (c) g = c; }
    if (!g.ok) return json({ ok: false, error: `A IA não concluiu a revisão agora (${String(g.detail || g.status).slice(0, 220)}). Tente novamente em alguns minutos.` }, 502);
    let result: any;
    try { result = parseJson(g.text); } catch { return json({ ok: false, error: "A revisão voltou incompleta. Tente novamente." }, 422); }
    result = { ...result, model: g.model, tab, file_name: fileName };
    if (reviewId) await a.from("legal_document_reviews").update({ status: "analyzed", result }).eq("id", reviewId).eq("org_id", orgId);
    return json({ ok: true, result, model: g.model });
  } catch (e) {
    console.error("legal-review", e);
    return json({ ok: false, error: `Não foi possível revisar agora: ${e instanceof Error ? e.message : "erro"}` }, 500);
  }
});
