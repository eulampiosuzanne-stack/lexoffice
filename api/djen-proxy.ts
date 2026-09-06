export const config = { runtime: 'edge' };

const allowed = new Set(['numeroOab','ufOab','dataDisponibilizacaoInicio','dataDisponibilizacaoFim','pagina','itensPorPagina']);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function validatedQuery(url: URL) {
  const qs = new URLSearchParams();
  for (const [key, raw] of url.searchParams) {
    if (!allowed.has(key)) continue;
    const value = raw.trim();
    if (!value) continue;
    if (key === 'ufOab' && !/^[A-Za-z]{2}$/.test(value)) throw new Error('UF_INVALIDA');
    if (key === 'numeroOab' && !/^\d{1,10}$/.test(value.replace(/\D/g, ''))) throw new Error('OAB_INVALIDA');
    if (key.startsWith('dataDisponibilizacao') && !datePattern.test(value)) throw new Error('DATA_INVALIDA');
    if (key === 'pagina' && (!/^\d+$/.test(value) || Number(value) < 1)) throw new Error('PAGINA_INVALIDA');
    if (key === 'itensPorPagina') {
      if (!/^\d+$/.test(value)) throw new Error('LIMITE_INVALIDO');
      qs.set(key, String(Math.min(Math.max(Number(value), 1), 100)));
      continue;
    }
    qs.set(key, key === 'ufOab' ? value.toUpperCase() : key === 'numeroOab' ? value.replace(/\D/g, '') : value);
  }
  return qs;
}

export default async function handler(req: Request) {
  if (req.method !== 'GET') return json({ error: 'Método não permitido.' }, 405);
  let qs: URLSearchParams;
  try {
    qs = validatedQuery(new URL(req.url));
  } catch {
    return json({ error: 'Parâmetros de consulta inválidos.' }, 400);
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
        },
        signal: AbortSignal.timeout(12_000)
      });
      const text = await r.text();
      if (r.ok) {
        return new Response(text, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      lastError = `Fonte judicial respondeu HTTP ${r.status}`;
    } catch (e) {
      lastError = e instanceof Error && e.name === 'TimeoutError' ? 'Tempo limite excedido ao consultar a fonte judicial' : 'Fonte judicial temporariamente indisponível';
    }
  }
  return json({ error: lastError || 'DJEN temporariamente indisponível.' }, 502);
}
