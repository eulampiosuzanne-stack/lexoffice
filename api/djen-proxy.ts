export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const allowed = ['numeroOab','ufOab','dataDisponibilizacaoInicio','dataDisponibilizacaoFim','pagina','itensPorPagina'];
  const qs = new URLSearchParams();
  for (const key of allowed) {
    const value = req.query?.[key];
    if (typeof value === 'string' && value.trim()) qs.set(key, value.trim());
  }
  const targets = [
    'https://comunicacaoapi.cnj.jus.br/api/v1/comunicacao',
    'https://comunicaapi.pje.jus.br/api/v1/comunicacao'
  ];
  let lastError = '';
  for (const base of targets) {
    try {
      const r = await fetch(`${base}?${qs.toString()}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 LEXOFFICE/1.0'
        }
      });
      const text = await r.text();
      if (r.ok) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(text);
        return;
      }
      lastError = `${base} HTTP ${r.status}: ${text.slice(0, 300)}`;
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }
  res.status(502).json({ error: lastError || 'DJEN unavailable' });
}
