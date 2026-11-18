const TJMG_EPROC = 'https://eproc-consulta-publica-1g.tjmg.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica';

export function prepareDistribution(process, clientId) {
  if (!process || process.client_id !== clientId || process.is_demo) return null;
  const number = String(process.cnj_number ?? '').trim();
  const court = String(process.tribunal_name || process.court || process.tribunal_code || '').trim();
  const digits = number.replace(/\D/g, '');
  if (!/^[\d.-]+$/.test(number) || digits.length !== 20 || !court) return null;
  const checksumInput = digits.slice(0, 7) + digits.slice(9) + digits.slice(7, 9);
  if (BigInt(checksumInput) % 97n !== 1n) return null;
  const isTjmg = /TJMG|MINAS GERAIS/i.test(court);
  const system = String(process.judicial_system || '').trim();
  const eproc = isTjmg && /eproc/i.test(system);
  const instructions = eproc
    ? '\n\nPara consultar: abra o link oficial, informe o número CNJ acima no campo de consulta do processo e selecione Consultar. A consulta é gratuita. Processos sob segredo de justiça podem ter acesso restrito.\n' + TJMG_EPROC
    : '\n\nPara consultar o processo, utilize o portal oficial do tribunal indicado. Nossa equipe pode orientar sobre o sistema correto.';
  return {
    sourceId: digits,
    message: 'Olá! Informamos que seu processo foi cadastrado após confirmação de distribuição.\nNúmero CNJ: ' + number + '\nTribunal: ' + court + instructions,
    guideUrl: eproc ? TJMG_EPROC : null,
  };
}
