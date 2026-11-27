// Pedido de documentos: o cliente manda o arquivo e marca na lista qual é. Lógica pura.
const cut = (s, n) => Array.from(String(s || '').replace(/[|\n]+/g, ' ').trim()).slice(0, n).join('');
export const OTHER = 'docreq:other';

// Até 9 pedidos + "Outro documento" (limite de 10 linhas da lista).
export function buildList(requests) {
  const rows = requests.slice(0, 9).map(r => ({ id: 'docreq:' + r.id, title: cut(r.title, 24), description: cut(r.title, 72) }));
  rows.push({ id: OTHER, title: 'Outro documento', description: 'Não está na lista' });
  const body = '📎 Recebi o seu arquivo! Qual documento é este?\n\nToque no botão abaixo e escolha. Se forem documentos diferentes, envie um de cada vez.';
  const asText = '📎 Recebi o seu arquivo! Qual documento é este?\n\n' + requests.slice(0, 9).map((r, i) => `${i + 1}. ${r.title}`).join('\n') + `\n${rows.length}. Outro documento\n\nResponda só com o número.`;
  return { body, asText, rows, options: rows.map(r => r.id) };
}

// Devolve o id do pedido, 'other' ou null (escolha inválida).
export function readChoice(rowId, text, options) {
  let id = String(rowId || '');
  if (!id.startsWith('docreq:')) {
    const m = String(text || '').match(/^\s*(\d{1,2})\s*$/);
    id = (m && options?.[Number(m[1]) - 1]) || '';
  }
  return id ? id.slice('docreq:'.length) : null;
}

export function extension(filename, mime) {
  const m = String(filename || '').match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  return { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp' }[mime] || 'bin';
}

export function confirmation(title, pending) {
  const head = title ? `✅ Recebido: *${title}*.` : '✅ Recebido! A Dra. vai conferir esse documento.';
  if (!pending.length) return head + '\n\nNão falta nenhum documento do pedido. Obrigada! 😊';
  return head + '\n\nAinda falta:\n' + pending.map(t => '• ' + t).join('\n') + '\n\nPode enviar o próximo por aqui.';
}
