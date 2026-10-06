import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

// Estratégia Processual — lê a documentação do caso (PDF/imagem), monta o dossiê, avalia a chance de êxito,
// emite parecer ao cliente, pede os documentos que faltam, indica o cálculo, ajuda na jurisprudência
// e redige o rascunho da petição inicial para revisão da advogada.
// v9 — a qualificação do(a) autor(a) vem do cadastro do cliente (nome, CPF, RG, estado civil, profissão, endereço, e-mail),
//      os dados do escritório (OAB, e-mail, endereço) vêm da LexOffice e a data de hoje é preenchida; [PREENCHER] fica só para o que faltar de verdade.

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

// Banco de Peças Ouro: padrões extraídos dos modelos aprovados pela Dra. Suzanne.
// É uma biblioteca de arquitetura e Visual Law, nunca uma fonte autônoma de fatos, artigos ou precedentes.
const PETITION_VISUAL_LIBRARY = `BANCO DE PEÇAS OURO DA LEXOFFICE
Use os modelos apenas como referência de arquitetura, hierarquia visual e técnica de apresentação. NUNCA copie nomes, fatos, valores, artigos, jurisprudência ou dados fictícios dos modelos.
Escolha recursos somente quando ajudarem a provar ou esclarecer algo no caso atual:
- Síntese processual / resumo executivo no início para casos densos.
- Alegação da parte contrária × resposta/defesa, especialmente contestação, réplica e contrarrazões.
- Decisão/sentença impugnada × erro/vício × razão para reforma, em recursos e embargos.
- Linha do tempo para sequência de fatos, tempestividade, decadência, prescrição, tratamento médico ou histórico processual.
- Fato × prova/documento × consequência jurídica quando houver documentação suficiente.
- Quadro de pontos controvertidos × prova necessária × finalidade da prova em réplica, saneamento e especificação de provas.
- Quadro financeiro e gráfico apenas quando números realmente demonstrarem renda, despesas, evolução de dívida, danos ou outro ponto probatório. Nunca crie gráfico decorativo.
- Quesito × resposta pericial × documento contrário × impugnação × consequência jurídica em matéria pericial.
- Quadro de requisitos da tutela/liminar, mandado de segurança ou habeas corpus quando facilitar a leitura.
- Quadro de testemunhas com qualificação, relação com as partes, necessidade de intimação e fato que cada uma provará.
- Memoriais com controvérsia, decisão anterior, prova produzida e razões objetivas para acolhimento da tese.
- Pareceres/planejamentos com índice, pendências, documentos necessários, cenários e recomendação final.
O recurso visual deve ser textual e compatível com Word: títulos claros, tabelas simples, listas curtas e blocos de síntese. Não use emojis. Se os dados não sustentarem um quadro ou gráfico, não o crie.
Antes de redigir, decida silenciosamente quais componentes do Banco de Peças Ouro realmente aumentam a compreensão e use somente esses.`;


const MARITAL: Record<string, string> = { single: "solteiro(a)", married: "casado(a)", divorced: "divorciado(a)", widowed: "viúvo(a)", separated: "separado(a)" };
const todayLong = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).format(new Date());

// Qualificação do(a) cliente direto do cadastro da LexOffice.
async function partyInfo(a: any, orgId: string, clientId: string | null) {
  if (!clientId) return null;
  const { data: c } = await a.from("clients").select("name,cpf_cnpj,rg,birth_date,marital_status,profession,address,email,phone,whatsapp").eq("id", clientId).eq("org_id", orgId).maybeSingle();
  if (!c) return null;
  const ad = c.address && typeof c.address === "object" ? c.address : {};
  const cityUf = ad.city && ad.state ? `${ad.city}/${ad.state}` : (ad.city || ad.state || "");
  const endereco = [ad.street, ad.number, ad.complement, ad.neighborhood, cityUf, ad.zip ? `CEP ${ad.zip}` : ""].filter(Boolean).join(", ");
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => { const s = String(v ?? "").trim(); if (s) out[k] = s; };
  put("nome", c.name); put("cpf_cnpj", c.cpf_cnpj); put("rg", c.rg); put("estado_civil", MARITAL[String(c.marital_status)] || c.marital_status);
  put("profissao", c.profession); put("endereco", endereco); put("cidade", ad.city); put("email", c.email); put("telefone", c.whatsapp || c.phone);
  return out;
}

// Dados do escritório: OAB do perfil da titular (ou do monitoramento do DJEN, se houver um só), e-mail e endereço das configurações.
async function officeInfo(a: any, orgId: string, given: any) {
  const o: any = { ...(given || {}) };
  try {
    if (!o.oab) {
      const { data: p } = await a.from("profiles").select("oab_number,oab_uf").eq("org_id", orgId).eq("role_key", "owner").not("oab_number", "is", null).limit(1).maybeSingle();
      let n = p?.oab_number, uf = p?.oab_uf;
      if (!n) {
        const { data: m } = await a.from("djen_monitors").select("oab_number,oab_uf").eq("org_id", orgId).not("oab_number", "is", null).limit(2);
        if ((m || []).length === 1) { n = m[0].oab_number; uf = m[0].oab_uf; }
      }
      if (n) o.oab = `${n}${uf && String(uf).toUpperCase() !== "MG" ? "/" + uf : ""}`;
    }
    const { data: s } = await a.from("organization_settings").select("email,phone,address").eq("org_id", orgId).maybeSingle();
    if (!o.email && s?.email) o.email = s.email;
    if (!o.phone && s?.phone) o.phone = s.phone;
    if (!o.address && s?.address) {
      const ad = s.address;
      o.address = typeof ad === "string" ? ad : [ad.street, ad.number, ad.complement, ad.neighborhood, ad.city && ad.state ? `${ad.city}/${ad.state}` : (ad.city || ad.state), ad.zip ? `CEP ${ad.zip}` : ""].filter(Boolean).join(", ");
    }
  } catch { /* segue sem os dados extras */ }
  return o;
}
async function runClientId(a: any, orgId: string, b: any) {
  if (b.client_id) return String(b.client_id);
  if (!b.run_id) return null;
  const { data } = await a.from("petition_assistant_runs").select("client_id").eq("id", b.run_id).eq("org_id", orgId).maybeSingle();
  return data?.client_id || null;
}

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
Dados já cadastrados na LexOffice (o cliente do escritório é o(a) AUTOR(A); use a qualificação abaixo em "partes.autores"): ${JSON.stringify(caseInfo)}
Anotações da advogada / relato do cliente: ${notes || "(nenhuma)"}

Regras obrigatórias:
- Use SOMENTE fatos presentes nos documentos ou nas anotações. Não invente nomes, datas, valores, números de documentos ou endereços.
- Quando algo essencial faltar, liste em "documentos_faltantes" ou "pendencias".
- Datas no formato DD/MM/AAAA; valores em número com ponto decimal (ex.: 1520.35).
- "calculo.calculadora" deve ser exatamente uma destas opções ou null: ${JSON.stringify(CALCULATORS)}.
- "chance_exito": avaliação franca, como advogada experiente faria para si mesma (não para agradar o cliente): "nivel" = "alta", "moderada" ou "baixa", com motivo objetivo, pontos fortes e pontos fracos. Considere provas existentes, o que falta e o entendimento dominante dos tribunais. Não use porcentagem.
- "documentos_solicitar": documentos concretos que o CLIENTE deve entregar para fortalecer ou viabilizar a ação, em linguagem simples que um leigo entenda (ex.: "Negativa do plano por escrito", "Relatório médico com CID e indicação de urgência"). Não repita o que já foi enviado. Máximo 12. "essencial": true para os indispensáveis.
- "prazo": prescrição/decadência aplicável (ex.: CDC art. 26 e 27; CC art. 205 e 206; Decreto 20.910/32; 120 dias do mandado de segurança). "data_limite" (AAAA-MM-DD) só se o termo inicial constar dos documentos/anotações; senão null. "risco": "alto" (menos de 90 dias ou possivelmente vencido), "medio", "baixo" ou "indefinido".
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
"chance_exito":{"nivel":"","motivo":"","pontos_fortes":[""],"pontos_fracos":[""]},
"documentos_solicitar":[{"titulo":"","descricao":"","essencial":true}],
"prazo":{"fundamento":"","termo_inicial":"","data_limite":null,"risco":"indefinido","observacao":""},
"valor_causa_sugerido":null,
"riscos":[""],
"pendencias":[""]}`;
}

const PARTS: Record<number, string> = {
  1: "PARTE 1 de 3 — escreva SOMENTE: endereçamento ao juízo competente; qualificação completa das partes; nome da ação; e a seção I – DOS FATOS. Pare ao terminar os fatos.",
  2: "PARTE 2 de 3 — escreva SOMENTE: II – DO DIREITO e, se cabível, III – DA TUTELA DE URGÊNCIA. Não repita o que já foi escrito. Pare ao terminar.",
  3: "PARTE 3 de 3 — escreva SOMENTE: DOS PEDIDOS (numerados), DAS PROVAS, DO VALOR DA CAUSA, requerimentos finais e o fecho com local, data e assinatura. Não repita o que já foi escrito.",
};

function draftPrompt(area: string, dossier: any, calc: string, instructions: string, office: any, part = 0, previous = "", juris = "", party: any = null) {
  const section = part && PARTS[part] ? `\n\n${PARTS[part]}${previous ? `\n\nTEXTO JÁ REDIGIDO (continue a partir dele, mantendo numeração e estilo):\n${previous.slice(-6000)}` : ""}` : "";
  const officeExtra = [office.address ? `endereço profissional: ${office.address}` : "", office.email ? `e-mail: ${office.email}` : "", office.phone ? `telefone: ${office.phone}` : ""].filter(Boolean).join("; ");
  return `Redija a PETIÇÃO INICIAL completa, pronta para revisão da advogada, com base no dossiê abaixo.${section}

Área: ${AREAS[area] || AREAS.civel}
Escritório: ${office.name || "Suzanne Figueiredo — Advocacia e Soluções Jurídicas"}. Advogada: ${office.lawyer || "Suzanne Figueiredo"}, OAB/MG ${office.oab || "[PREENCHER: nº OAB]"}${officeExtra ? `; ${officeExtra}` : ""}.
AUTOR(A) — qualificação do cadastro da LexOffice (use exatamente estes dados; não troque por [PREENCHER]): ${party ? JSON.stringify(party) : "(cliente não selecionado — use o dossiê)"}
Data de hoje: ${todayLong()} (use no fecho).
Instruções específicas da advogada: ${instructions || "(nenhuma)"}

DOSSIÊ (fonte única dos fatos):
${JSON.stringify(dossier, null, 1)}

MEMÓRIA DE CÁLCULO (use os valores exatamente como estão; não recalcule):
${calc || "(sem cálculo)"}

JURISPRUDÊNCIA SELECIONADA PELA ADVOGADA (cite somente estas, com tribunal, número e data exatamente como estão; se estiver vazio, não cite julgados com número):
${juris || "(nenhuma)"}

${PETITION_VISUAL_LIBRARY}\n\nEstrutura obrigatória: endereçamento ao juízo competente; qualificação completa das partes; nome da ação; I – DOS FATOS; II – DO DIREITO (com fundamentos legais e, quando pertinente, súmulas/temas de tribunais superiores que você tenha certeza que existem); III – DA TUTELA DE URGÊNCIA (somente se cabível); IV – DOS PEDIDOS (numerados); V – DAS PROVAS; VI – DO VALOR DA CAUSA; requerimentos finais (justiça gratuita somente se o dossiê indicar; opção por audiência de conciliação; segredo de justiça quando aplicável); local, data e assinatura.

Regras:
- Português jurídico formal, claro e persuasivo, sem floreios. Parágrafos curtos.
- Dados do(a) autor(a) e do escritório informados acima DEVEM ser usados como estão. Use [PREENCHER: descrição] SOMENTE para o que não constar nem acima nem no dossiê (ex.: dados da parte ré que não vieram nos documentos).
- NÃO invente fatos, números, jurisprudência com número de processo, nem dados pessoais.
- Cite documentos como "(doc. anexo – nome do documento)".
- Não use markdown com asteriscos. Títulos em MAIÚSCULAS em linha própria. Texto puro.
- Termine com "Nestes termos, pede deferimento." seguido de local/data e assinatura da advogada.`;
}

function opinionPrompt(area: string, dossier: any, office: any, clientName: string) {
  return `Redija um PARECER JURÍDICO para ser entregue ao cliente ${clientName || "[PREENCHER: nome do cliente]"}, assinado pela advogada ${office.lawyer || "Suzanne Figueiredo"}${office.oab ? `, OAB/MG ${office.oab}` : ""} (${office.name || "Suzanne Figueiredo — Advocacia e Soluções Jurídicas"}), com base no dossiê abaixo.
Data de hoje: ${todayLong()} (use no fecho).

Área: ${AREAS[area] || AREAS.civel}
DOSSIÊ:
${JSON.stringify(dossier, null, 1)}

Estrutura: PARECER JURÍDICO (título); Interessado; Assunto; I – DA CONSULTA (o que o cliente trouxe); II – DOS FATOS (resumo fiel); III – DA ANÁLISE JURÍDICA (fundamentos em linguagem clara, explicando os termos técnicos); IV – DOS RISCOS E DA CHANCE DE ÊXITO (honesta e equilibrada, usando o nível do dossiê, sem porcentagem e sem prometer resultado); V – DOS DOCUMENTOS NECESSÁRIOS; VI – DO PRAZO (se houver risco de prescrição, deixar claro); VII – CONCLUSÃO E RECOMENDAÇÃO (qual medida judicial ou extrajudicial se recomenda); local, data e assinatura.

Regras:
- Linguagem formal, porém compreensível para um leigo. Parágrafos curtos.
- Não prometa êxito. Deixe claro que o resultado depende da análise do Judiciário e das provas.
- Não mencione honorários, tabela da OAB, inteligência artificial nem a palavra "boutique".
- Não invente fatos, valores ou julgados. O que faltar escreva como [PREENCHER: descrição].
- Texto puro, sem markdown nem asteriscos. Títulos em MAIÚSCULAS em linha própria.`;
}

async function ask(mKey: string, gKey: string, models: string[], prompt: string, asJson: boolean, maxTokens: number) {
  const started = Date.now();
  let r: any = mKey ? await maritaca(mKey, prompt, maxTokens, asJson, 95000) : { ok: false, status: 503, detail: "Maritaca não configurada" };
  const first = r;
  if (!r.ok && gKey) r = await gemini(gKey, models, { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: asJson ? 0.1 : 0.3, maxOutputTokens: Math.max(maxTokens, 8192), ...(asJson ? { responseMimeType: "application/json" } : {}) } }, started + 135000);
  if (!r.ok) r = { ...r, detail: `${first.detail || first.status} | ${r.detail || r.status}` };
  return r;
}

const firstName = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";
const todayBR = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
// n dias úteis (seg–sex) depois de hoje, às 10h de Brasília.
function businessDaysAhead(n: number) {
  const d = new Date(`${todayBR()}T10:00:00-03:00`);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = new Date(d.getTime() - 3 * 3600 * 1000).getUTCDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d.toISOString();
}
function docsMessage(name: string, items: { title: string }[]) {
  return [firstName(name) ? `Olá, ${firstName(name)}.` : "Olá.", "Para darmos andamento ao seu caso, precisamos dos documentos abaixo:", items.map((i) => `- ${i.title}`).join("\n"), "Você pode enviar por aqui mesmo, em foto ou PDF, ou pelo aplicativo do escritório.", "Se tiver alguma dúvida sobre algum item, é só me responder."].join("\n\n");
}
function reminderMessage(name: string, items: { title: string }[], second: boolean) {
  return [firstName(name) ? `Olá, ${firstName(name)}.` : "Olá.", second ? "Ainda estamos aguardando alguns documentos para seguir com o seu caso." : "Passando para lembrar dos documentos do seu caso.", `Pendentes: ${items.map((i) => i.title).join("; ")}.`, "Pode enviar por aqui mesmo, em foto ou PDF."].join("\n\n");
}
function jurisLinks(q: string) {
  const e = encodeURIComponent(q);
  return [
    { fonte: "TJMG", url: `https://www5.tjmg.jus.br/jurisprudencia/pesquisaPalavrasEspelhoAcordao.do?palavras=${e}&pesquisarPor=ementa&orderByData=2&linhasPorPagina=10&pesquisaPalavras=Pesquisar` },
    { fonte: "STJ", url: `https://scon.stj.jus.br/SCON/pesquisar.jsp?b=ACOR&livre=${e}` },
    { fonte: "STF", url: `https://jurisprudencia.stf.jus.br/pages/search?base=acordaos&queryString=${e}` },
    { fonte: "Jusbrasil", url: `https://www.jusbrasil.com.br/jurisprudencia/busca?q=${e}` },
  ];
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
      const party = await partyInfo(a, orgId, b.client_id ? String(b.client_id) : null);
      const caseInfo = { ...(b.case_info || {}), ...(party ? { qualificacao_autor: party } : {}) };
      const payload = { contents: [{ role: "user", parts: [{ text: analyzePrompt(area, caseInfo, notes) }, ...files.parts] }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" } };
      const started = Date.now();
      // Sabiá-4 (Maritaca) lê os documentos primeiro; o Gemini fica de reserva.
      let r: any = mKey ? await maritaca(mKey, files.mparts.length ? [...files.mparts, { type: "text", text: analyzePrompt(area, caseInfo, notes) }] : analyzePrompt(area, caseInfo, notes), 6000, true, 110000) : { ok: false, status: 503, detail: "Maritaca não configurada" };
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
      const party = await partyInfo(a, orgId, await runClientId(a, orgId, b));
      const office = await officeInfo(a, orgId, b.office || {});
      const payload = { contents: [{ role: "user", parts: [{ text: draftPrompt(area, dossier, calc, String(b.instructions || "").slice(0, 6000), office, Number(b.part) || 0, String(b.previous || ""), String(b.jurisprudence || "").slice(0, 12000), party) }] }], generationConfig: { temperature: 0.3, maxOutputTokens: Number(b.part) ? 5000 : 12000 } };
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

    if (action === "opinion") {
      const dossier = b.dossier;
      if (!dossier || typeof dossier !== "object") return json({ ok: false, error: "Faça a análise do caso primeiro." }, 400);
      const office = await officeInfo(a, orgId, b.office || {});
      const r = await ask(mKey, key, models, opinionPrompt(area, dossier, office, String(b.client_name || "")), false, 6000);
      if (!r.ok) return json({ ok: false, error: `Não foi possível redigir o parecer agora (${String(r.detail || r.status).slice(0, 200)}). Tente de novo em alguns minutos.` }, 502);
      const opinion = r.text.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim();
      if (b.run_id) await a.from("petition_assistant_runs").update({ opinion, dossier, updated_at: new Date().toISOString() }).eq("id", b.run_id).eq("org_id", orgId);
      return json({ ok: true, opinion, model: r.model });
    }

    if (action === "save_opinion") {
      if (!b.run_id) return json({ ok: false, error: "Caso não encontrado." }, 400);
      await a.from("petition_assistant_runs").update({ opinion: String(b.opinion || ""), updated_at: new Date().toISOString() }).eq("id", b.run_id).eq("org_id", orgId);
      return json({ ok: true });
    }

    // Pede os documentos ao cliente: lista no app + lembretes automáticos por WhatsApp (dias úteis, 10h).
    if (action === "request_docs") {
      if (!b.run_id) return json({ ok: false, error: "Faça a análise do caso primeiro." }, 400);
      const { data: run } = await a.from("petition_assistant_runs").select("id,client_id").eq("id", b.run_id).eq("org_id", orgId).maybeSingle();
      if (!run?.client_id) return json({ ok: false, error: "Escolha o cliente do caso antes de pedir documentos." }, 400);
      const items = (Array.isArray(b.items) ? b.items : []).map((i: any) => ({ title: String(i?.title || "").trim().slice(0, 160), description: String(i?.description || "").trim().slice(0, 400) })).filter((i: any) => i.title).slice(0, 15);
      if (!items.length) return json({ ok: false, error: "Marque ao menos um documento." }, 400);
      const { data: c } = await a.from("clients").select("id,name,phone,whatsapp").eq("id", run.client_id).eq("org_id", orgId).maybeSingle();
      if (!c) return json({ ok: false, error: "Cliente não encontrado." }, 404);
      const phone = String(c.whatsapp || c.phone || "").replace(/\D/g, "");
      const { data: existing } = await a.from("client_document_requests").select("title").eq("petition_run_id", run.id);
      const have = new Set((existing || []).map((e: any) => String(e.title).toLowerCase()));
      const fresh = items.filter((i: any) => !have.has(i.title.toLowerCase()));
      if (fresh.length) {
        const { error } = await a.from("client_document_requests").insert(fresh.map((i: any) => ({ org_id: orgId, client_id: c.id, petition_run_id: run.id, title: i.title, description: i.description || null, status: "pending", requested_by: userId, requires_authorization: false, authorization_status: "not_required", reminder_enabled: false })));
        if (error) throw new Error(`Não foi possível criar a lista no app do cliente: ${error.message}`);
      }
      let reminders = 0;
      const reminderErrors: string[] = [];
      if (phone && b.reminders !== false) {
        await a.from("scheduled_client_messages").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("petition_run_id", run.id).eq("status", "pending");
        for (const [days, second] of [[3, false], [7, true]] as const) {
          const { error } = await a.from("scheduled_client_messages").insert({ org_id: orgId, client_id: c.id, petition_run_id: run.id, client_name: c.name, phone, message: reminderMessage(c.name, items, second), agent_key: "client_schedule_relationship", scheduled_at: businessDaysAhead(days), status: "pending", created_by: userId });
          if (error) reminderErrors.push(error.message); else reminders++;
        }
      }
      await a.from("petition_assistant_runs").update({ docs_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", run.id).eq("org_id", orgId);
      return json({ ok: true, created: fresh.length, reminders, reminder_errors: reminderErrors, phone: phone || null, client_name: c.name, message: docsMessage(c.name, items) });
    }

    if (action === "juris_terms") {
      const prompt = `Com base neste caso, sugira de 3 a 5 buscas curtas (3 a 6 palavras cada, sem aspas, sem operadores) para encontrar jurisprudência FAVORÁVEL ao nosso cliente nos sites de tribunais (TJMG, STJ, STF). Liste também as teses jurídicas que a jurisprudência deve sustentar.
Área: ${AREAS[area] || AREAS.civel}
Caso: ${JSON.stringify(b.dossier || {}).slice(0, 8000)}
Não cite números de processo, súmulas ou julgados específicos — apenas termos de busca e teses.
Responda APENAS com JSON: {"buscas":[""],"teses":[""]}`;
      const r = await ask(mKey, key, models, prompt, true, 1200);
      let out: any = null;
      try { out = r.ok ? JSON.parse(stripFence(r.text)) : null; } catch { out = null; }
      if (!out) return json({ ok: false, error: "Não foi possível sugerir as buscas agora. Tente de novo." }, 502);
      const buscas = (Array.isArray(out.buscas) ? out.buscas : []).map((q: any) => String(q).trim()).filter(Boolean).slice(0, 5);
      return json({ ok: true, teses: (Array.isArray(out.teses) ? out.teses : []).slice(0, 6), buscas: buscas.map((q: string) => ({ termo: q, links: jurisLinks(q) })) });
    }

    // A advogada cola as ementas; a IA separa as favoráveis. Só vale trecho que está literalmente no texto colado.
    if (action === "juris_filter") {
      const text = String(b.text || "").slice(0, 40000);
      if (text.trim().length < 80) return json({ ok: false, error: "Cole ao menos uma ementa completa." }, 400);
      const prompt = `Você recebe ementas coladas pela advogada. Para cada ementa, identifique tribunal, número do processo, relator e data EXATAMENTE como aparecem no texto (se não aparecer, deixe vazio — nunca invente). Classifique se é favorável ou desfavorável ao nosso cliente neste caso e explique em uma frase.
Área: ${AREAS[area] || AREAS.civel}
Caso: ${JSON.stringify(b.dossier || {}).slice(0, 6000)}
EMENTAS:
"""
${text}
"""
Responda APENAS com JSON: {"julgados":[{"tribunal":"","processo":"","relator":"","data":"","favoravel":true,"motivo":"","trecho_util":""}]}
"trecho_util" deve ser cópia literal do trecho mais útil da ementa (até 600 caracteres).`;
      const r = await ask(mKey, key, models, prompt, true, 5000);
      let out: any = null;
      try { out = r.ok ? JSON.parse(stripFence(r.text)) : null; } catch { out = null; }
      if (!out || !Array.isArray(out.julgados)) return json({ ok: false, error: "Não foi possível analisar as ementas agora. Tente de novo." }, 502);
      const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
      const src = norm(text);
      const julgados = out.julgados.map((j: any) => {
        const trecho = String(j?.trecho_util || "").trim();
        const literal = Boolean(trecho) && src.includes(norm(trecho).slice(0, 120));
        return { tribunal: String(j?.tribunal || ""), processo: String(j?.processo || ""), relator: String(j?.relator || ""), data: String(j?.data || ""), favoravel: j?.favoravel !== false, motivo: String(j?.motivo || ""), trecho_util: literal ? trecho : "", conferido: literal };
      });
      return json({ ok: true, julgados });
    }

    return json({ ok: false, error: "Ação inválida" }, 400);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m === "UNAUTHORIZED") return json({ ok: false, error: "Sessão expirada. Entre novamente." }, 401);
    if (m === "FORBIDDEN") return json({ ok: false, error: "Usuário sem acesso ao escritório" }, 403);
    return json({ ok: false, error: m }, 500);
  }
});
