import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, classify, mergeRoles, buildBody, numberingPatch, originalFingerprint, bodyFingerprint } from "./layout.mjs";

const run = (t, o = {}) => `<w:r>${o.b || o.i ? `<w:rPr>${o.b ? "<w:b/>" : ""}${o.i ? "<w:i/>" : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r>`;
const p = (...r) => `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>${r.join("")}</w:p>`;
const tbl = (rows) => `<w:tbl><w:tblPr/><w:tr>${rows[0].map((c) => `<w:tc>${p(run(c, { b: true }))}</w:tc>`).join("")}</w:tr>${rows.slice(1).map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(run(c))}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
const img = `<w:p><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p>`;
const DOC = (body) => `<w:document><w:body>${body}<w:sectPr><w:pgSz/></w:sectPr></w:body></w:document>`;

const sample = DOC([
  p(run("EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA CÍVEL DA COMARCA DE BELO HORIZONTE/MG")),
  p(run("Processo nº 1234567-89.2026.8.13.0024")),
  p(run("MARIA DA SILVA", { b: true }), run(", brasileira, solteira, já qualificada nos autos, vem apresentar")),
  p(run("AÇÃO DE OBRIGAÇÃO DE FAZER C/C TUTELA DE URGÊNCIA")),
  p(run("em face de "), run("PLANO DE SAÚDE S/A", { b: true }), run(", pelos fatos & fundamentos a seguir <expostos>.")),
  p(run("1. DOS FATOS")),
  p(run("A autora contratou o plano em 10/01/2024 e em 05/03/2026 teve o procedimento negado.")),
  p(run("1.1. Da negativa")),
  p(run("A negativa ocorreu sem justificativa técnica.")),
  img,
  tbl([["Data", "Fato"], ["10/01/2024", "Contratação"], ["05/03/2026", "Negativa"]]),
  p(run("2. DO DIREITO")),
  p(run("“AGRAVO INTERNO. PLANO DE SAÚDE. Rol da ANS exemplificativo. Cobertura devida. Recurso desprovido.” (STJ, AgInt no REsp 1.234.567/SP, Rel. Min. Fulano, j. 01/01/2025).")),
  p(run("3. DOS PEDIDOS")),
  p(run("Diante do exposto, requer:")),
  p(run("a) a concessão da tutela de urgência;")),
  p(run("b) a citação da ré;")),
  p(run("c) a procedência total.")),
  p(run("Para fins de alçada, a causa vale R$ 10.000,00. Requer ainda:")),
  p(run("a) intimação do Ministério Público;")),
  p(run("b) produção de prova pericial.")),
  p(run("Nestes termos, pede deferimento.")),
  p(run("Belo Horizonte/MG, 23 de novembro de 2026.")),
  p(run("____________________________________")),
  p(run("SUZANNE FIGUEIREDO")),
  p(run("OAB/MG 131.880")),
].join(""));

test("lê parágrafos, tabela e imagem do Word", () => {
  const { items, images } = parseDocument(sample);
  assert.equal(images, 1);
  assert.equal(items.filter((i) => i.type === "tbl").length, 1);
  assert.equal(items.find((i) => i.type === "tbl").rows.length, 3);
  assert.ok(items[2].runs[0].b, "negrito preservado");
});

test("classifica a estrutura da peça", () => {
  const { items } = parseDocument(sample);
  const roles = classify(items);
  const ps = items.filter((i) => i.type === "p");
  const by = (start) => roles[ps.findIndex((x) => x.text.startsWith(start))];
  assert.equal(by("EXCELENT"), "E"); assert.equal(by("Processo"), "PR"); assert.equal(by("AÇÃO"), "TP");
  assert.equal(by("1. DOS FATOS"), "H1"); assert.equal(by("1.1."), "H2"); assert.equal(by("2. DO DIREITO"), "H1");
  assert.equal(by("“AGRAVO"), "CIT"); assert.equal(by("a) a concessão"), "PED");
  assert.equal(by("Nestes"), "FE"); assert.equal(by("Belo"), "DT"); assert.equal(by("____"), "SL");
  assert.equal(by("SUZANNE"), "SN"); assert.equal(by("OAB"), "SO"); assert.equal(by("A autora"), "P");
});

test("monta o corpo nos estilos, sem formatação cravada e sem perder texto", () => {
  const { items } = parseDocument(sample); const roles = classify(items);
  const { body, extraLists } = buildBody(items, roles, {});
  for (const s of ["Enderecamento", "TituloPeca", "Heading1", "Heading2", "Citacao", "Pedido", "Fecho", "DataLocal", "AssinaturaNome", "TabelaPeca"]) assert.ok(body.includes(`w:val="${s}"`), s);
  assert.ok(!/<w:rFonts|<w:sz |<w:color |w:jc /.test(body), "nada de fonte/tamanho/cor/alinhamento à mão");
  assert.equal(extraLists, 1, "2 listas de pedidos → 1 reinício");
  assert.ok(body.includes('w:numId w:val="11"'));
  assert.ok(!body.includes(">a) a concessão"), "marcador a) vira numeração automática");
  assert.ok(body.includes("[IMAGEM 1"), "imagem sinalizada");
  assert.equal(bodyFingerprint(body), originalFingerprint(items), "texto idêntico ao original");
  assert.ok(body.includes("fatos &amp; fundamentos a seguir &lt;expostos&gt;"), "escape XML");
});

test("insere quadro-síntese e linha do tempo gerados no lugar certo", () => {
  const { items } = parseDocument(sample); const roles = classify(items);
  const { body } = buildBody(items, roles, { quadro: [["Objeto", "Obrigação de fazer"], ["Fato central", "Negativa de cobertura"]], linha: [["10/01/2024", "Contratação do plano", "Contrato"], ["05/03/2026", "Negativa do procedimento", "Protocolo"]] });
  const iQ = body.indexOf("Quadro-síntese da demanda"), iF = body.indexOf("1. DOS FATOS"), iL = body.indexOf("Linha do tempo documentada"), iD = body.indexOf("2. DO DIREITO");
  assert.ok(iQ > 0 && iQ < iF, "quadro antes do 1º título");
  assert.ok(iL > iF && iL < iD, "linha do tempo no fim da seção de fatos");
  assert.equal(bodyFingerprint(body), originalFingerprint(items));
});

test("negativos: IA inválida cai na heurística; regras objetivas não são sobrescritas", () => {
  const { items } = parseDocument(sample); const heur = classify(items);
  assert.deepEqual(mergeRoles(heur, ["P"]), heur, "tamanho errado");
  assert.deepEqual(mergeRoles(heur, null), heur);
  assert.deepEqual(mergeRoles(heur, heur.map(() => "ZZ")), heur, "códigos inválidos");
  const ai = heur.map(() => "P"); const merged = mergeRoles(heur, ai);
  assert.equal(merged[heur.indexOf("SO")], "SO"); assert.equal(merged[heur.indexOf("DT")], "DT");
});

test("casos-limite: documento vazio, só uma linha, tabela sem texto, numeração extra", () => {
  assert.equal(parseDocument(DOC("")).items.length, 0);
  const one = parseDocument(DOC(p(run("Apenas uma frase solta."))));
  const b = buildBody(one.items, classify(one.items), {});
  assert.ok(b.body.includes("Apenas uma frase solta.") && b.extraLists === 0);
  assert.equal(parseDocument(DOC(`<w:tbl><w:tr><w:tc>${p(run(" "))}</w:tc></w:tr></w:tbl>`)).items.length, 0);
  assert.equal(numberingPatch(2).match(/<w:num /g).length, 2);
  assert.equal(numberingPatch(0), "");
});
