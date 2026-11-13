export function prepareDistribution(process, clientId) {
  if (!process || process.client_id !== clientId || process.is_demo) return null;
  const number = String(process.cnj_number ?? '').trim();
  const court = String(process.tribunal_name || process.court || process.tribunal_code || '').trim();
  const digits = number.replace(/\D/g, '');
  if (!/^[\d.-]+$/.test(number) || digits.length !== 20 || !court) return null;
  const checksumInput = digits.slice(0, 7) + digits.slice(9) + digits.slice(7, 9);
  if (BigInt(checksumInput) % 97n !== 1n) return null;
  return {
    sourceId: digits,
    message: 'Olá! 💛 Temos uma atualização importante: seu processo foi distribuído. Nossa equipe continuará acompanhando as próximas movimentações. Confira os detalhes na Área do Cliente.',
  };
}
