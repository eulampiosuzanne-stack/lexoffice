// Número para o provedor de WhatsApp: cadastro brasileiro sem o 55 ganha o código do país.
// Não mexe em número com "+", com "@" (id do WhatsApp) nem em número que já tem 55.
export function waNumber(value) {
  const raw = String(value ?? '').trim();
  if (raw.includes('@')) return raw.replace(/\D/g, '');
  const d = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return d;
  const ddd = /^[1-9][1-9]/.test(d);
  return ddd && (d.length === 10 || (d.length === 11 && d[2] === '9')) ? '55' + d : d;
}
