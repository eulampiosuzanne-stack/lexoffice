// 26/11/2026 (Dra. Suzanne): comprovante da consulta confirmado automaticamente. Na dúvida, NÃO libera e avisa.
const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[*_`#]/g, '');

export const looksLikeReceipt = text => { const t = plain(text); return /comprovante/.test(t) && /\b(pix|transferencia|ted|pagamento)\b/.test(t) && /r\$/.test(t); };

export function checkReceipt(text, { fee = 300, now = Date.now() } = {}) {
  const t = plain(text), lines = t.split('\n');
  const no = reason => ({ ok: false, reason });
  if (!looksLikeReceipt(text) || !/\b(pix|transferencia|ted)\b/.test(t)) return no('não parece um comprovante de Pix ou transferência');
  if (/agendad|agendamento|programad|estorn|devolvid|cancelad|nao (foi )?(efetivad|concluid|realizad)|pendente|em processamento|em analise|simulacao/.test(t)) return no('o comprovante indica pagamento agendado, pendente, cancelado ou devolvido');
  const v = t.match(/valor[^:\n]{0,30}:\s*r\$\s*([\d.]+,\d{2})/);
  const amount = v ? Number(v[1].replace(/\./g, '').replace(',', '.')) : NaN;
  if (!Number.isFinite(amount)) return no('não consegui ler o valor');
  if (Math.abs(amount - fee) > 0.001) return no(`valor de R$ ${v[1]}, diferente da consulta`);
  let receiver = '';
  const i = lines.findIndex(l => /(recebedor|destinatario|favorecido|quem recebeu)/.test(l));
  if (i >= 0) {
    for (const l of lines.slice(i, i + 3)) {
      if (/pagador|origem|remetente|quem pagou/.test(l) && receiver) break;
      receiver += ' ' + l.replace(/^.*?(recebedor|destinatario|favorecido|quem recebeu)/, '').split(/pagador|remetente|quem pagou/)[0];
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(receiver.replace(/\b(nome|cpf|cnpj|instituicao|banco|dados do)\b/g, ''))) break;
    }
  }
  if (!(/\bsuzanne\b/.test(receiver) && /\bfigueiredo\b/.test(receiver))) return no('não confirmei que quem recebeu foi a Dra. Suzanne');
  const d = t.match(/(\d{2})\/(\d{2})\/(\d{4})\D{1,12}?(\d{2})[:h](\d{2})(?:[:m](\d{2}))?/);
  if (!d) return no('não consegui ler data e hora do pagamento');
  const when = Date.parse(`${d[3]}-${d[2]}-${d[1]}T${d[4]}:${d[5]}:${d[6] || '00'}-03:00`);
  if (!Number.isFinite(when) || when > now + 3600000 || now - when > 72 * 3600000) return no('a data do pagamento não é recente');
  const id = t.match(/\be\d{8}\d{12}[a-z0-9]{11}\b/);
  const payer = (t.match(/(?:pagador|remetente|quem pagou)[^:\n]{0,20}:\s*([a-z ]{3,60})/) || [])[1] || '';
  const reference = id ? id[0] : `comprovante:${amount.toFixed(2)}:${new Date(when).toISOString()}:${payer.trim()}`;
  return { ok: true, amount, reference, paidAt: new Date(when).toISOString() };
}

// com/sem 55 e com/sem o 9º dígito.
export function phoneVariants(phone) {
  const p = String(phone || '').replace(/\D/g, '');
  const local = p.startsWith('55') && p.length >= 12 ? p.slice(2) : p;
  if (local.length < 10) return [p];
  const ddd = local.slice(0, 2), tail = local.slice(-8);
  return [...new Set([p, local, '55' + ddd + tail, '55' + ddd + '9' + tail, ddd + tail, ddd + '9' + tail])];
}
