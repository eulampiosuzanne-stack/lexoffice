// Timbrado oficial do escritório (cabeçalho e rodapé) para os documentos que a LEX imprime/gera em HTML.
// As imagens ficam em /public/timbrado/ (as mesmas do modelo Word "Timbrado Claro").

const CSS = `
@page{size:A4;margin:0}
html,body{margin:0!important;padding:0!important;max-width:none!important;background:#fff}
.brand,.topbar,.bottom,.logo,.logo-fallback,.office{display:none!important}
.header{background:none!important;border:0!important;padding:0!important}
.tb-h,.tb-f{display:block;width:100%;height:auto}
table.tb-wrap{width:100%;border-collapse:collapse;border:0;margin:0}
table.tb-wrap>thead>tr>td,table.tb-wrap>tbody>tr>td,table.tb-wrap>tfoot>tr>td{border:0!important;padding:0!important;background:none!important}
.tb-body{padding:0 20mm}
.tb-sp-h,.tb-sp-f{display:none}
@media print{
  .tb-h,.tb-f{position:fixed;left:0}
  .tb-h{top:0}.tb-f{bottom:0}
  .tb-sp-h{display:block;height:56mm}
  .tb-sp-f{display:block;height:44mm}
}
@media screen{body{max-width:210mm!important;margin:0 auto!important;box-shadow:0 0 18px rgba(0,0,0,.12)}.tb-body{padding:10mm 20mm}}
`;

// Recebe um documento HTML completo e devolve o mesmo documento dentro do timbrado.
export function withTimbrado(html: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const head = `<img class="tb-h" src="${base}/timbrado/cabecalho.png" alt="">`;
  const foot = `<img class="tb-f" src="${base}/timbrado/rodape.png" alt="">`;
  let out = String(html || '');
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `<style>${CSS}</style></head>`) : `<style>${CSS}</style>${out}`;
  const m = out.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  if (!m) return out;
  const wrapped = `<body${m[1]}>${head}<table class="tb-wrap"><thead><tr><td><div class="tb-sp-h"></div></td></tr></thead><tfoot><tr><td><div class="tb-sp-f"></div></td></tr></tfoot><tbody><tr><td><div class="tb-body">${m[2]}</div></td></tr></tbody></table>${foot}</body>`;
  return out.replace(m[0], () => wrapped);
}
