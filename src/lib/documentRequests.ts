// Pedido de documentos ao cliente quando o juízo determina a juntada.
const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Um documento por linha; ignora marcadores, linhas vazias, repetidos e o que já está aguardando o cliente. */
export function parseDocumentList(text: string, pending: string[] = []): string[] {
  const seen = new Set(pending.map(key));
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const title = line.replace(/^\s*(?:[-*•–]|\d{1,2}[.)])\s+/, '').trim().slice(0, 200);
    if (title.length < 2 || seen.has(key(title))) continue;
    seen.add(key(title));
    out.push(title);
  }
  return out;
}

export function documentRequestDescription(cnj: string, due: string, note: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due.split('-').reverse().join('/') : '';
  return [note.trim(), date && `Enviar até ${date}.`, cnj && `Processo ${cnj}.`].filter(Boolean).join(' ');
}
