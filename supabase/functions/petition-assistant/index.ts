import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

// Assistente de Petição Inicial — lê a documentação do caso (PDF/imagem), monta o dossiê,
// indica o cálculo necessário e redige o rascunho da petição inicial para revisão da advogada.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const BUCKET = "lexoffice-documents";
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
const READABLE = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i;

const AREAS: Record<string, string> = {
  familia: "Direito de Família (divórcio, alimentos, guarda, convivência, partilha, medidas protetivas). Observar segredo de justiça (art. 189 CPC), interesse de incapazes e intervenção do Ministério Público quando houver.",
  consumidor: "Direito do Consumidor (CDC): relação de consumo, inversão do ônus da prova (art. 6º, VIII), responsabilidade objetiva, dano moral e material, repetição do indébito (art. 42, parágrafo único).",
  saude: "Direito Médico e da Saúde: planos de saúde (Lei 9.656/98, rol da ANS, Lei 14.454/2022), SUS e fornecimento de tratamento, erro médico, home care; avaliar tutela de urgência (art. 300 CPC) com relatório médico.",
  civel: "Direito Civil geral: obrigações, contratos, responsabilidade civil, cobrança, indenização.",
  administrativo: "Direito Administrativo: atos administrativos, servidores, licitações e contratos, responsabilidade do Estado (art. 37, §6º, CF), mandado de segurança quando cabível.",
};

const CALCULATORS = ["Execução de Alimentos", "Pensão Alimentícia", "Atualização monetária e juros", "Revisional Bancária", "Financiamento e empréstimos", "Superendividamento", "RMC / RCC INSS", "Aluguel e reajuste locatício", "Inventário e Quinhões", "Danos Materiais", "Custas e Honorários", "Prazo Processual"];

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

async function maritacaKey(a: any, orgId: string) {
  for (const provider of ["maritaca_api", "maritaca_api_key"]) {
    try {
      const { data } = await a.rpc("read_integration_secret", { p_org_id: orgId, p_provider: provider });
      const key = String(data || "").trim();
      if (key) return key;
    } catch { /* tenta o próximo */ }
  }
  try {
    const { data } = await a.from("system_runtime_secrets").select("secret").eq("key", "maritaca_api_key").maybeSingle();
    const key = String(data?.secret || "").trim();
    if (key) return key;
  } catch { /* segue para variável de ambiente */ }
  return (Deno.env.get("MARITACA_API_KEY") || "").trim();
}

// Maritaca (Sabiá-4, brasileira, paga em reais): redige e também lê PDF/imagem (com OCR) enviados em base64.
async function maritaca(key: string, prompt: string | any[], maxTokens: number, json = false, timeoutMs = 100000) {
  const model = (Deno.env.get("MARITACA_MODEL") || "sabia-4").trim();
  try {
    const r = await fetch("https://chat.maritaca.ai/api/chat/completions", { signal: AbortSignal.timeout(timeoutMs), method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: "Você é advogado(a) brasileiro(a) sênior. Responda somente em português do Brasil." }, { role: "user", content: prompt }], temperature: json ? 0.1 : 0.3, max_tokens: maxTokens, ...(Array.isArray(prompt) ? { extraction_effort: "medium" } : {}) }) });
    const out = await r.json().catch(() => null);
    const text = String(out?.choices?.[0]?.message?.content || "").trim();
    if (r.ok && text) return { ok: true as const, text, model: `maritaca/${model}` };
    return { ok: false as const, status: r.status, detail: `maritaca/${model}: ${out?.error?.message || out?.detail || "sem resposta"}` };
  } catch (e) {
    return { ok: false as const, status: 502, detail: `maritaca: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function gemini(key: string, models: string[], payload: unknown, deadline = Date.now() + 120000) {
  let last: any = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline - Date.now();
      if (left < 15000) return { ok: false as const, status: 504, detail: last?.detail || "tempo esgotado" };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(left - 5000), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch((e) => ({ ok: false, status: 504, json: async () => ({ error: { message: `tempo esgotado (${e?.name || "erro"})` } }) }) as any);
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

const stripFence = (s: string) => {
  const t = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  return i >= 0 && j > i ? t.slice(i, j + 1) : t;
};
function toBase64(bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

async function loadFiles(a: any, orgId: string, ids: string[]) {
  if (!ids.length) return { parts: [] as any[], mparts: [] as any[], names: [] as string[], skipped: [] as string[] };
  const { data: docs, error } = await a.from("documents").select("id,org_id,name,file_path,mime_type,size_bytes,category").in("id", ids.slice(0, 12)).eq("org_id", orgId);
  if (error) throw new Error("Não foi possível localizar os documentos enviados.");
  const parts: any[] = [], mparts: any[] = [], names: string[] = [], skipped: string[] = [];
  let total = 0;
  for (const d of docs || []) {
    const mime = String(d.mime_type || (/\.pdf$/i.test(d.file_path) ? "application/pdf" : "")).toLowerCase();
    if (!READABLE.test(mime) || !String(d.file_path).startsWith(`${orgId}/`)) { skipped.push(`${d.name} (formato não lido)`); continue; }
    const { data: blob, error: de } = await a.storage.from(BUCKET).download(d.file_path);
    if (de || !blob) { skipped.push(`${d.name} (falha ao baixar)`); continue; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (total + bytes.length > MAX_TOTAL_BYTES) { skipped.push(`${d.name} (limite de tamanho do lote)`); continue; }
    total += bytes.length;
    parts.push({ text: `--- Documento: ${d.name} (categoria: ${d.category || "não informada"}) ---` });
    const m = mime === "image/jpg" ? "image/jpeg" : mime, b64 = toBase64(bytes);
    parts.push({ inline_data: { mime_type: m, data: b64 } });
    mparts.push({ type: "text", text: `--- Documento: ${d.name} (categoria: ${d.category || "não informada"}) ---` });
    mparts.push(m === "application/pdf" ? { type: "file", file: { filename: d.name, file_data: `data:${m};base64,${b64}` } } : { type: "image_url", image_url: { url: `data:${m};base64,${b64}` } });
    names.push(d.name);
  }
  return { parts, mparts, names, skipped };
}

function analyzePrompt(area: string, caseInfo: any, notes: string) {
  return `Você é advogado(a) sênior brasileiro(a) assessorando a Dra. Suzanne Figueiredo (OAB/MG). Analise TODOS os documentos anexados e as anotações da advogada para preparar o caso para uma PETIÇÃO INICIAL.

Área: ${AREAS[area] || AREAS.civel}
Dados já cadastrados na LexOffice: ${JSON.stringify(caseInfo)}
Anotações da advogada / relato do cliente: ${notes || "(nenhuma)"}

Regras obrigatórias:
- Use SOMENTE fatos presentes nos documentos ou nas anotações. Não invente nomes, datas, valores, números de documentos ou endereços.
- Quando algo essencial faltar, liste em "documentos_faltantes" ou "pendencias".
- Datas no formato DD/MM/AAAA; valores em número com ponto decimal (ex.: 1520.35).
- "calculo.calculadora" deve ser exatamente uma destas opções ou null: ${JSON.stringify(CALCULATORS)}.
- Em "calculo.valores", use apenas números/datas extraídos dos documentos (datas em AAAA-MM-DD), com as chaves: principal, startDate, endDate, monthlyAmount, paidAmount, correctionPercent, interestPercent, penalty, rate, directLoss, lostProfits, otherLosses, income, percentage, fixedAmount, dependents, claimValue, feesPercentage. Omita o que não constar.

Responda APENAS com JSON válido neste formato:
{"tipo_acao":"","rito":"","competencia":"","segredo_justica":false,
"partes":{"autores":[{"nome":"","qualificacao":""}],"reus":[{"nome":"","qualificacao":""}]},
"resumo":"",
"cronologia":[{"data":"","fato":"","documento":""}],
"provas_existentes":[""],
"documentos_faltantes":[""],
"fundamentos_sugeridos":[""],
"pedidos_sugeridos":[""],
"tutela_urgencia":{"cabivel":false,"fundamento":""},
"calculo":{"necessario":false,"calculadora":null,"motivo":"","valores":{}},
"valor_causa_sugerido":null,
"riscos":[""],
"pendencias":[""]}`;
}

const PARTS: Record<number, string> = {
  1: "PARTE 1 de 3 — escreva SOMENTE: endereçamento ao juízo competente; qualificação completa das partes; nome da ação; e a seção I – DOS FATOS. Pare ao terminar os fatos.",
  2: "PARTE 2 de 3 — escreva SOMENTE: II – DO DIREITO e, se cabível, III – DA TUTELA DE URGÊNCIA. Não repita o que já foi escrito. Pare ao terminar.",
  3: "PARTE 3 de 3 — escreva SOMENTE: DOS PEDIDOS (numerados), DAS PROVAS, DO VALOR DA CAUSA, requerimentos finais e o fecho com local, data e assinatura. Não repita o que já foi escrito.",
};

function draftPrompt(area: string, dossier: any, calc: string, instructions: string, office: any, part = 0, previous = "") {
  const section = part && PARTS[part] ? `\n\n${PARTS[part]}${previous ? `\n\nTEXTO JÁ REDIGIDO (continue a partir dele, mantendo numeração e estilo):\n${previous.slice(-6000)}` : ""}` : "";
  return `Redija a PETIÇÃO INICIAL completa, pronta para revisão da advogada, com base no dossiê abaixo.${section}

Área: ${AREAS[area] || AREAS.civel}
Escritório: ${office.name || "Suzanne Figueiredo — Advocacia e Soluções Jurídicas"}. Advogada: ${office.lawyer || "Suzanne Figueiredo"}, OAB/MG ${office.oab || "[PREENCHER: nº OAB]"}.
Instruções específicas da advogada: ${instructions || "(nenhuma)"}

DOSSIÊ (fonte única dos fatos):
${JSON.stringify(dossier, null, 1)}

MEMÓRIA DE CÁLCULO (use os valores exatamente como estão; não recalcule):
${calc || "(sem cálculo)"}

Estrutura obrigatória: endereçamento ao juízo competente; qualificação completa das partes; nome da ação; I – DOS FATOS; II – DO DIREITO (com fundamentos legais e, quando pertinente, súmulas/temas de tribunais superiores que você tenha certeza que existem); III – DA TUTELA DE URGÊNCIA (somente se cabível); IV – DOS PEDIDOS (numerados); V – DAS PROVAS; VI – DO VALOR DA CAUSA; requerimentos finais (justiça gratuita somente se o dossiê indicar; opção por audiência de conciliação; segredo de justiça quando aplicável); local, data e assinatura.

Regras:
- Português jurídico formal, claro e persuasivo, sem floreios. Parágrafos curtos.
- NÃO invente fatos, números, jurisprudência com número de processo, nem dados pessoais. Tudo o que faltar escreva como [PREENCHER: descrição].
- Cite documentos como "(doc. anexo – nome do documento)".
- Não use markdown com asteriscos. Títulos em MAIÚSCULAS em linha própria. Texto puro.
- Termine com "Nestes termos, pede deferimento." seguido de local/data e assinatura da advogada.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método inválido" }, 405);
  try {
    const { a, orgId, userId } = await context(req);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");
    const area = AREAS[String(b.area)] ? String(b.area) : "civel";
    const key = await geminiKey(a, orgId);
    const mKey = await maritacaKey(a, orgId);
    if (!key && !mKey) return json({ ok: false, error: "Nenhuma IA configurada em Integrações (Maritaca ou Google Gemini)." }, 503);
    // Modelos em ordem de preferência; o Google aposenta versões com frequência, então há alias e reserva.
    const models = [...new Set([Deno.env.get("PETITION_MODEL"), Deno.env.get("GEMINI_MODEL"), "gemini-flash-latest", "gemini-3.8-flash"].map((m) => String(m || "").trim()).filter(Boolean))];

    if (action === "analyze") {
      const ids = Array.isArray(b.document_ids) ? b.document_ids.map(String) : [];
      const notes = String(b.notes || "").slice(0, 12000);
      if (!ids.length && notes.trim().length < 40) return json({ ok: false, error: "Envie ao menos um documento ou descreva o caso com mais detalhes." }, 400);
      const files = await loadFiles(a, orgId, ids);
      const payload = { contents: [{ role: "user", parts: [{ text: analyzePrompt(area, b.case_info || {}, notes) }, ...files.parts] }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" } };
      const started = Date.now();
      // Sabiá-4 (Maritaca) lê os documentos primeiro; o Gemini fica de reserva.
      let r: any = mKey ? await maritaca(mKey, files.mparts.length ? [...files.mparts, { type: "text", text: analyzePrompt(area, b.case_info || {}, notes) }] : analyzePrompt(area, b.case_info || {}, notes), 6000, true, 110000) : { ok: false, status: 503, detail: "Maritaca não configurada" };
      const firstTry = r;
      if (!r.ok && key) r = await gemini(key, models, payload, started + 140000);
      if (!r.ok) r = { ...r, detail: `${firstTry.detail || firstTry.status} | ${r.detail || r.status}` };
      if (!r.ok) {
        const quota = [429, 503].includes(r.status);
        return json({ ok: false, error: quota ? `A IA não conseguiu ler os documentos agora (${String(r.detail || r.status).slice(0, 220)}). Tente de novo em alguns minutos.` : `A IA não conseguiu ler os documentos (${r.status}${r.detail ? ": " + r.detail : ""}).` }, 502);
      }
      let dossier: any;
      try { dossier = JSON.parse(stripFence(r.text)); } catch { return json({ ok: false, error: "A IA devolveu um dossiê em formato inválido. Tente novamente." }, 422); }
      if (dossier?.calculo?.calculadora && !CALCULATORS.includes(dossier.calculo.calculadora)) dossier.calculo.calculadora = null;
      const { data: run } = await a.from("petition_assistant_runs").insert({ org_id: orgId, created_by: userId, client_id: b.client_id || null, process_id: b.process_id || null, area, notes, document_ids: ids, dossier, status: "analisado", model: r.model }).select("id").maybeSingle();
      return json({ ok: true, run_id: run?.id || null, dossier, read: files.names, skipped: files.skipped, model: r.model });
    }

    if (action === "draft") {
      const dossier = b.dossier;
      if (!dossier || typeof dossier !== "object") return json({ ok: false, error: "Dossiê ausente. Faça a análise primeiro." }, 400);
      const calc = String(b.calculation || "").slice(0, 20000);
      const payload = { contents: [{ role: "user", parts: [{ text: draftPrompt(area, dossier, calc, String(b.instructions || "").slice(0, 6000), b.office || {}, Number(b.part) || 0, String(b.previous || "")) }] }], generationConfig: { temperature: 0.3, maxOutputTokens: Number(b.part) ? 5000 : 12000 } };
      const prompt = payload.contents[0].parts[0].text;
      const started = Date.now();
      let r: any = mKey ? await maritaca(mKey, prompt, Number(b.part) ? 3500 : 8000, false, 95000) : { ok: false, status: 503, detail: "Maritaca não configurada" };
      const first = r;
      if (!r.ok && key) r = await gemini(key, models, payload, started + 135000);
      if (!r.ok) return json({ ok: false, error: `Não foi possível redigir a petição agora (${String(first.detail || first.status).slice(0, 140)} | ${String(r.detail || r.status).slice(0, 140)}). Tente de novo em alguns minutos.` }, 502);
      const petition = r.text.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim();
      if (b.run_id && (!Number(b.part) || Number(b.part) === 3)) await a.from("petition_assistant_runs").update({ dossier, calculation: calc || null, instructions: b.instructions || null, petition: Number(b.part) === 3 ? `${String(b.previous || "")}\n\n${petition}`.trim() : petition, status: "redigido", model: r.model, updated_at: new Date().toISOString() }).eq("id", b.run_id).eq("org_id", orgId);
      return json({ ok: true, petition, model: r.model });
    }

    if (action === "save") {
      if (!b.run_id) return json({ ok: false, error: "Rascunho não encontrado." }, 400);
      await a.from("petition_assistant_runs").update({ petition: String(b.petition || ""), status: String(b.status || "revisado"), document_id: b.document_id || null, updated_at: new Date().toISOString() }).eq("id", b.run_id).eq("org_id", orgId);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Ação inválida" }, 400);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m === "UNAUTHORIZED") return json({ ok: false, error: "Sessão expirada. Entre novamente." }, 401);
    if (m === "FORBIDDEN") return json({ ok: false, error: "Usuário sem acesso ao escritório" }, 403);
    return json({ ok: false, error: m }, 500);
  }
});
