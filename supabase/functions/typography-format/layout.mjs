// Tipografia → "Formatar peça": lê o Word enviado, identifica a função de cada parágrafo e remonta o corpo
// nos ESTILOS oficiais do escritório (modelo-peticao.docx). Nunca reescreve o texto da peça: só o organiza.
// Módulo puro (sem Deno/Node específicos) para poder ser testado com `node --test`.

export const ROLES = ["E", "PR", "TP", "H1", "H2", "H3", "P", "CIT", "PED", "FE", "DT", "SL", "SN", "SO", "DS"];
const MAIN_W = 9071; // largura útil (dxa) do modelo

export const xe = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xd = (s) => String(s ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// ---------- leitura do Word ----------
function blockEnd(xml, from, tag) {
  const open = new RegExp(`<${tag}[\\s>]`, "g"), close = `</${tag}>`;
  let depth = 0, i = from;
  for (;;) {
    open.lastIndex = i;
    const o = open.exec(xml); const c = xml.indexOf(close, i);
    if (c < 0) return xml.length;
    if (o && o.index < c) { depth++; i = o.index + 2; continue; }
    depth--; i = c + close.length;
    if (depth <= 0) return i;
  }
}
const flag = (rpr, tag) => {
  const m = rpr.match(new RegExp(`<w:${tag}(\\s[^>]*)?/>`));
  if (!m) return false;
  return !/w:val="(0|false|off)"/i.test(m[1] || "");
};
function parseRuns(pxml) {
  const runs = [];
  for (const m of pxml.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
    const inner = m[1];
    const rpr = (inner.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [, ""])[1];
    let text = "";
    for (const t of inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:noBreakHyphen\s*\/>/g)) {
      if (t[0].startsWith("<w:tab")) text += " ";
      else if (t[0].startsWith("<w:br")) text += "\n";
      else if (t[0].startsWith("<w:noBreakHyphen")) text += "-";
      else text += xd(t[1]).replace(/\s*[\r\n]+\s*/g, " ");
    }
    if (!text) continue;
    const b = flag(rpr, "b"), i = flag(rpr, "i");
    const last = runs[runs.length - 1];
    if (last && last.b === b && last.i === i) last.t += text; else runs.push({ t: text, b, i });
  }
  return runs;
}
const cleanRuns = (runs) => {
  const out = runs.map((r) => ({ ...r, t: r.t.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n") }));
  if (out.length) { out[0].t = out[0].t.replace(/^[\s]+/, ""); out[out.length - 1].t = out[out.length - 1].t.replace(/[\s]+$/, ""); }
  return out.filter((r) => r.t !== "");
};
const plain = (runs) => runs.map((r) => r.t).join("");

// Devolve a sequência de itens do corpo: parágrafos, tabelas e marcadores de imagem.
export function parseDocument(documentXml) {
  const bodyStart = documentXml.indexOf("<w:body>") + 8;
  const sect = documentXml.lastIndexOf("<w:sectPr");
  const xml = documentXml.slice(bodyStart, sect > bodyStart ? sect : undefined);
  const items = []; let images = 0, i = 0;
  const startRe = /<w:tbl>|<w:p[\s>]/g;
  for (;;) {
    startRe.lastIndex = i; const m = startRe.exec(xml); if (!m) break;
    if (m[0] === "<w:tbl>") {
      const end = blockEnd(xml, m.index, "w:tbl"); const t = xml.slice(m.index, end);
      const rows = [...t.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((r) =>
        [...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) =>
          [...c[1].matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((p) => plain(cleanRuns(parseRuns(p[1])))).filter(Boolean).join("\n")));
      let real = rows.filter((r) => r.length && r.some((c) => c.trim()));
      // descarta colunas que estão vazias em todas as linhas (sobras do Word)
      const nc = Math.max(0, ...real.map((r) => r.length));
      const keep = Array.from({ length: nc }, (_, c) => c).filter((c) => real.some((r) => String(r[c] || "").trim()));
      real = real.map((r) => keep.map((c) => r[c] || ""));
      if (real.length) items.push({ type: "tbl", rows: real });
      i = end; continue;
    }
    const end = blockEnd(xml, m.index, "w:p"); const p = xml.slice(m.index, end); i = end;
    const imgs = (p.match(/<w:drawing[\s>]|<w:pict[\s>]/g) || []).length; if (imgs) { images += imgs; items.push({ type: "img", n: images }); }
    const runs = cleanRuns(parseRuns(p)); const text = plain(runs).trim();
    if (text) items.push({ type: "p", runs, text });
  }
  return { items, images };
}

// ---------- classificação ----------
const wc = (s) => s.split(/\s+/).filter(Boolean).length;
const isCaps = (s) => { const l = s.replace(/[^A-Za-zÀ-ÿ]/g, ""); return l.length >= 4 && l === l.toUpperCase(); };
const TITLE_RE = /A[ÇC][ÃA]O|PETI[ÇC][ÃA]O|CONTESTA[ÇC][ÃA]O|R[ÉE]PLICA|RECURSO|APELA[ÇC][ÃA]O|AGRAVO|EMBARGOS|MANDADO|RECLAMA[ÇC][ÃA]O|CUMPRIMENTO|EXECU[ÇC][ÃA]O|NOTIFICA[ÇC][ÃA]O|PARECER|REQUERIMENTO|MANIFESTA[ÇC][ÃA]O|HABILITA[ÇC][ÃA]O|TUTELA|MEMORIAIS|ALEGA[ÇC][ÕO]ES|CONTRARRAZ[ÕO]ES/;

export function classify(items) {
  const roles = []; let seenH1 = false, seenTP = false;
  const ps = items.map((it, k) => ({ it, k })).filter((x) => x.it.type === "p");
  ps.forEach(({ it }, n) => {
    const t = it.text; let r = "P"; const next = ps[n + 1]?.it.text || "";
    if (n < 4 && !seenH1 && (/^(EXCELENT[ÍI]SSIM|AO\s+JU[ÍI]ZO|À\s|AO\s+(EXMO|DOUTOR|MM)|EXMO|MERIT[ÍI]SSIM)/i.test(t) || (isCaps(t) && t.length < 220 && /JU[ÍI]ZO|VARA|TRIBUNAL|COMARCA|DESEMBARGADOR|JUIZADO|TURMA/i.test(t)))) r = "E";
    else if (/^(processo|autos)\s*(n[ºo°.]|nº)/i.test(t) && t.length < 140) r = "PR";
    else if (/^(nestes termos|termos em que|pede deferimento|p\.\s*deferimento)/i.test(t) && t.length < 90) r = "FE";
    else if (/^[_\-–—.\s]{10,}$/.test(t)) r = "SL";
    else if (/^OAB\s*[\/\-]?\s*[A-Z]{0,2}\s*[nº°.\s]*[\d.]{3,}/i.test(t) && t.length < 50) r = "SO";
    else if (/^[\p{L} .]+\/[A-Z]{2},?\s+(\d{1,2}|_+)\s+de\s+[\p{L}_ ]+\s+de\s+(\d{4}|_+)\.?$/u.test(t) && t.length < 90) r = "DT";
    else if (/^\d+(\.\d+){0,3}[.)]?\s+\S/.test(t) && t.length <= 150 && wc(t) <= 22 && !/[.;]$/.test(t.replace(/^\d+(\.\d+)*[.)]?\s*/, "")) ) {
      const num = t.match(/^(\d+(?:\.\d+)*)/)[1]; const d = num.split(".").length; r = d <= 1 ? "H1" : d === 2 ? "H2" : "H3";
    } else if (/^[IVX]{1,5}\s*[-–—.)]\s+\S/.test(t) && t.length <= 150 && wc(t) <= 22 && !/[.;]$/.test(t)) r = "H1";
    else if (isCaps(t) && t.length <= 130 && wc(t) <= 16 && !/[.;]$/.test(t)) r = (!seenH1 && !seenTP && TITLE_RE.test(t)) ? "TP" : (seenTP || seenH1 ? "H1" : "TP");
    else if (/^[a-zç]\)\s+\S/.test(t)) r = "PED";
    else if (/^[“"«]/.test(t) && t.length > 140) r = "CIT";
    else if (/^ementa\b/i.test(t)) r = "CIT";
    if (isCaps(t) && next && /^OAB/i.test(next) && t.length < 90 && ["P", "H1", "TP"].includes(r)) r = "SN";
    if (r === "H1") seenH1 = true; if (r === "TP") seenTP = true;
    roles.push(r);
  });
  return roles;
}

// Junta a classificação da IA (se válida) com a heurística; a IA nunca altera a quantidade de parágrafos.
export function mergeRoles(heur, ai) {
  if (!Array.isArray(ai) || ai.length !== heur.length) return heur;
  return heur.map((h, i) => {
    const a = String(ai[i] || "").toUpperCase();
    if (!ROLES.includes(a)) return h;
    if (["SL", "SO", "DT", "FE", "PR"].includes(h)) return h;   // regras objetivas prevalecem
    return a;
  });
}

// ---------- montagem do corpo ----------
const rStyled = (r, plainStyle) => {
  const props = (!plainStyle && r.b ? '<w:rStyle w:val="Strong"/>' : "") + (!plainStyle && r.i ? "<w:i/><w:iCs/>" : "");
  const parts = r.t.split("\n").map((ln, k) => (k ? "<w:br/>" : "") + (ln ? `<w:t xml:space="preserve">${xe(ln)}</w:t>` : ""));
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${parts.join("")}</w:r>`;
};
const P = (style, runsXml, extra = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${runsXml}</w:p>`;
const T = (style, text) => P(style, rStyled({ t: text, b: false, i: false }, true));
const sp = () => P("EspacoTabela", "");

function cell(w, style, text) { return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${String(text || "").split("\n").map((l) => T(style, l)).join("") || T(style, "")}</w:tc>`; }
function table(style, hdr, widths, rows, headRow, firstColLabel) {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  let out = `<w:tbl><w:tblPr><w:tblStyle w:val="${style}"/><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="${hdr}" w:firstRow="${headRow ? 1 : 0}" w:lastRow="0" w:firstColumn="${firstColLabel ? 1 : 0}" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>`;
  rows.forEach((row, ri) => {
    out += `<w:tr><w:trPr><w:cantSplit/>${headRow && ri === 0 ? "<w:tblHeader/>" : ""}</w:trPr>`;
    widths.forEach((w, ci) => {
      const st = headRow && ri === 0 ? "CabecalhoTabela" : firstColLabel && ci === 0 ? "RotuloTabela" : "TextoTabela";
      out += cell(w, st, row[ci] ?? "");
    });
    out += "</w:tr>";
  });
  return out + "</w:tbl>";
}
const evenWidths = (n) => { const b = Math.floor(MAIN_W / n); return Array.from({ length: n }, (_, i) => (i === n - 1 ? MAIN_W - b * (n - 1) : b)); };

// ---------- gráfico comparativo (barras em tabela do Word, editável) ----------
const parseBR = (t) => { const m = String(t).match(/\d[\d.]*(?:,\d+)?/); if (!m) return NaN; return Number(m[0].replace(/\./g, "").replace(",", ".")); };
const unitOf = (t) => (/R\$/.test(t) ? "R$" : /%/.test(t) ? "%" : "");
const squash = (s) => String(s || "").replace(/\s+/g, " ").replace(/R\$\s*/g, "R$ ");
// Aceita só barras cujo valor aparece EXPRESSAMENTE no texto da peça; a IA nunca inventa número.
export function validateCharts(items, graficos) {
  if (!Array.isArray(graficos)) return [];
  const out = [];
  for (const g of graficos.slice(0, 2)) {
    const bars = [];
    for (const b of Array.isArray(g?.barras) ? g.barras : []) {
      if (!Array.isArray(b) || !b[0] || !b[1]) continue;
      const text = squash(String(b[1]).trim()); const value = parseBR(text);
      if (!Number.isFinite(value) || value <= 0) continue;
      bars.push({ label: String(b[0]).slice(0, 60), value, text, unit: unitOf(text) });
    }
    const unit = bars[0]?.unit; const same = bars.filter((b) => b.unit === unit).slice(0, 6);
    const hit = items.map((it, k) => ({ it, k })).filter((x) => x.it.type === "p");
    const ok = same.filter((b) => hit.some((x) => squash(x.it.text).includes(b.text)));
    if (ok.length < 2) continue;
    let best = -1, bestN = 0;
    hit.forEach((x) => { const n = ok.filter((b) => squash(x.it.text).includes(b.text)).length; if (n > bestN) { bestN = n; best = x.k; } });
    if (best < 0) { best = hit[hit.length - 1].k; }
    out.push({ after: best, title: String(g.titulo || "Comparativo").slice(0, 90), bars: ok });
  }
  return out;
}
const BAR_COLORS = ["5C3D1D", "906937", "D4AF37", "7A6F61", "C9B79C", "B08D57"];
function chartXml(c) {
  // colunas verticais feitas com células sombreadas de altura fixa: editável no Word, sem imagem
  const n = c.bars.length, ROWS = 12, H = 300, max = Math.max(...c.bars.map((b) => b.value));
  const cw = Math.floor(MAIN_W / n), widths = Array.from({ length: n }, (_, i) => (i === n - 1 ? MAIN_W - cw * (n - 1) : cw));
  const hs = c.bars.map((b) => Math.max(1, Math.round((b.value / max) * ROWS)));
  const gap = '<w:tcBorders><w:left w:val="single" w:sz="48" w:space="0" w:color="FFFFFF"/><w:right w:val="single" w:sz="48" w:space="0" w:color="FFFFFF"/></w:tcBorders>';
  const cell = (w, inner, fill) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${gap}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ""}<w:vAlign w:val="center"/></w:tcPr>${inner}</w:tc>`;
  const centered = (style, text) => P(style, rStyled({ t: text, b: false, i: false }, true), '<w:jc w:val="center"/>');
  const row = (cells, h, rule) => `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${h}" w:hRule="${rule}"/></w:trPr>${cells}</w:tr>`;
  let rows = row(c.bars.map((b, i) => cell(widths[i], centered("RotuloTabela", b.text), null)).join(""), 400, "atLeast");
  for (let r = 0; r < ROWS; r++) rows += row(c.bars.map((b, i) => cell(widths[i], P("EspacoTabela", ""), r >= ROWS - hs[i] ? BAR_COLORS[i % BAR_COLORS.length] : null)).join(""), H, "exact");
  rows += row(c.bars.map((b, i) => cell(widths[i], centered("TextoTabela", b.label), null)).join(""), 400, "atLeast");
  const tbl = `<w:tbl><w:tblPr><w:tblW w:w="${MAIN_W}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows}</w:tbl>`;
  return P("Heading3", rStyled({ t: `Representação gráfica — ${c.title}`, b: false, i: false }, true)) + tbl + sp();
}

export function buildBody(items, roles, extras = {}) {
  const out = []; let pi = 0, pedList = -1, inPed = false, listCount = 0, rendered = 0;
  const qs = Array.isArray(extras.quadro) ? extras.quadro.filter((r) => Array.isArray(r) && r[0] && r[1]).slice(0, 8) : [];
  const tl = Array.isArray(extras.linha) ? extras.linha.filter((r) => Array.isArray(r) && r[1]).slice(0, 14) : [];
  // posições: quadro antes do 1º H1; linha do tempo no fim da seção de fatos
  const pItems = items.map((it, k) => ({ it, k })).filter((x) => x.it.type === "p");
  const roleOfItem = new Map(pItems.map((x, n) => [x.k, roles[n]]));
  const firstH1 = items.findIndex((it, k) => roleOfItem.get(k) === "H1");
  let factsStart = -1, factsEnd = -1;
  items.forEach((it, k) => { if (roleOfItem.get(k) === "H1" && /fatos|hist[óo]rico|narrativa/i.test(it.text)) factsStart = k; });
  if (factsStart >= 0) { factsEnd = items.findIndex((it, k) => k > factsStart && roleOfItem.get(k) === "H1"); if (factsEnd < 0) factsEnd = items.length; }
  const quadroXml = () => P("Heading1", rStyled({ t: "Quadro-síntese da demanda", b: false, i: false }, true)) + table("QuadroSintese", "0480", [2520, 6551], qs.map((r) => [String(r[0]).slice(0, 60), String(r[1]).slice(0, 400)]), false, true) + sp();
  const linhaXml = () => P("Heading2", rStyled({ t: "Linha do tempo documentada", b: false, i: false }, true)) + table("TabelaPeca", "0420", [1814, 3628, 3629], [["Marco", "Ocorrência", "Prova / Efeito"], ...tl.map((r) => [String(r[0] || "").slice(0, 30), String(r[1]).slice(0, 300), String(r[2] || "").slice(0, 200)])], true, false) + sp();
  let quadroDone = !qs.length, linhaDone = !tl.length || factsStart < 0;
  const charts = validateCharts(items, extras.graficos); const chartAt = new Map(); charts.forEach((c) => chartAt.set(c.after, [...(chartAt.get(c.after) || []), c]));
  const flush = (k) => { for (const c of chartAt.get(k) || []) out.push(chartXml(c)); chartAt.delete(k); };

  items.forEach((it, k) => {
    if (k > 0) flush(k - 1);
    if (!quadroDone && k === firstH1) { out.push(quadroXml()); quadroDone = true; }
    if (!linhaDone && k === factsEnd) { out.push(linhaXml()); linhaDone = true; }
    if (it.type === "img") { out.push(T("Normal", `[IMAGEM ${it.n} — inserir aqui a imagem do documento original]`)); return; }
    if (it.type === "tbl" && it.rows.length === 1 && it.rows[0].length === 1) {
      // caixa de uma célula = destaque: Aptos SemiBold 10, cores suaves
      out.push(table("CaixaDestaque", "0480", [MAIN_W], [[it.rows[0][0]]], false, true).replace(/<w:p><w:pPr><w:pStyle w:val="RotuloTabela"\/>/g, '<w:p><w:pPr><w:pStyle w:val="DestaqueCentral"/>') + sp()); rendered++; return;
    }
    if (it.type === "tbl" && it.rows.every((r) => r.length === 2) && it.rows.length <= 12 && it.rows.length >= 2 && it.rows.every((r) => r[0].length <= 40 && !/[\n\d]/.test(r[0])) && !it.rows.slice(1).some((r) => /^(Fato|Ocorr|Prova|Valor|Descri)/i.test(r[0]))) {
      // tabela de dois campos (rótulo e valor): quadro com rótulo em destaque, sem linha de cabeçalho
      out.push(table("QuadroSintese", "0480", [2520, 6551], it.rows, false, true) + sp()); rendered++; return;
    }
    if (it.type === "tbl") {
      const n = Math.max(...it.rows.map((r) => r.length)); const w = evenWidths(Math.min(n, 8));
      out.push(table("TabelaPeca", "0420", w, it.rows.map((r) => w.map((_, c) => r[c] || "")), true, false) + sp()); rendered++; return;
    }
    const role = roles[pi++]; rendered++;
    const runs = it.runs; const txt = it.text;
    if (role !== "PED") inPed = false;
    switch (role) {
      case "E": out.push(P("Enderecamento", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "PR": out.push(P("Processo", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "TP": out.push(P("TituloPeca", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "H1": out.push(P("Heading1", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "H2": out.push(P("Heading2", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "H3": out.push(P("Heading3", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "CIT": out.push(P("Citacao", runs.map((r) => rStyled({ ...r, i: false }, true)).join(""))); break;
      case "FE": out.push(P("Fecho", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "DT": out.push(P("DataLocal", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "SL": out.push(P("AssinaturaLinha", rStyled({ t: "____________________________________", b: false, i: false }, true))); break;
      case "SN": out.push(P("AssinaturaNome", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "SO": out.push(P("AssinaturaOAB", runs.map((r) => rStyled(r, true)).join(""))); break;
      case "DS": out.push(table("CaixaDestaque", "0480", [MAIN_W], [[txt]].map((r) => r), false, true).replace(/<w:p><w:pPr><w:pStyle w:val="RotuloTabela"\/>/g, '<w:p><w:pPr><w:pStyle w:val="DestaqueCentral"/>') + sp()); break;
      case "PED": {
        // nova lista só quando a letra recomeça em "a)"; c), d)... continuam a lista anterior (mesmo após tabelas/títulos)
        const letter = (txt.match(/^([a-zç])\)/) || [, "a"])[1];
        if (listCount === 0 || letter === "a") { listCount++; pedList = listCount - 1; }
        inPed = true;
        const first = runs.map((r) => ({ ...r })); first[0].t = first[0].t.replace(/^[a-zç]\)\s+/, "");
        const num = pedList === 0 ? "" : `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${10 + pedList}"/></w:numPr>`;
        out.push(P("Pedido", first.map((r) => rStyled(r, false)).join(""), num)); break;
      }
      default: out.push(P("Normal", runs.map((r) => rStyled(r, false)).join(""))); break;
    }
  });
  flush(items.length - 1);
  if (!quadroDone && qs.length) out.splice(Math.min(3, out.length), 0, quadroXml());
  return { body: out.join(""), extraLists: Math.max(0, listCount - 1), rendered, charts: charts.length };
}

// <w:num> adicionais para reiniciar a contagem a), b), c) em cada lista de pedidos.
export function numberingPatch(extraLists) {
  let s = "";
  for (let i = 1; i <= extraLists; i++) s += `<w:num w:numId="${10 + i}"><w:abstractNumId w:val="10"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;
  return s;
}

// Texto normalizado (só letras e números) para conferir que nada do original se perdeu.
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function originalFingerprint(items) {
  return norm(items.map((it) => it.type === "p" ? it.text.replace(/^[a-zç]\)\s+/, "") : it.type === "tbl" ? it.rows.flat().join(" ") : "").join(" "));
}
export function bodyFingerprint(bodyXml, skipGenerated = true) {
  let x = bodyXml;
  if (skipGenerated) {
    x = x.replace(/<w:p><w:pPr><w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Quadro-síntese da demanda<\/w:t><\/w:r><\/w:p>[\s\S]*?<\/w:tbl>/, "")
      .replace(/<w:p><w:pPr><w:pStyle w:val="Heading2"\/><\/w:pPr><w:r><w:t xml:space="preserve">Linha do tempo documentada<\/w:t><\/w:r><\/w:p>[\s\S]*?<\/w:tbl>/, "")
      .replace(/<w:p><w:pPr><w:pStyle w:val="Heading3"\/><\/w:pPr><w:r><w:t xml:space="preserve">Representação gráfica —[^<]*<\/w:t><\/w:r><\/w:p>[\s\S]*?<\/w:tbl>/g, "")
      .replace(/<w:p><w:pPr><w:pStyle w:val="Normal"\/><\/w:pPr><w:r><w:t xml:space="preserve">\[IMAGEM[^<]*<\/w:t><\/w:r><\/w:p>/g, "");
  }
  return norm(xd([...x.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(" ")));
}
