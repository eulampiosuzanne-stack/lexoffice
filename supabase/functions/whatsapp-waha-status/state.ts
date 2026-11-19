// Funções puras (sem Deno/Supabase) para poder testar com node --experimental-strip-types.
export type OfficeState = 'connected' | 'connecting' | 'qr_pending' | 'disconnected' | 'unknown';

// Estados de sessão do WAHA -> estados usados pela tela do escritório.
export function mapWahaStatus(raw: unknown): OfficeState {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === 'WORKING') return 'connected';
  if (s === 'STARTING') return 'connecting';
  if (s === 'SCAN_QR_CODE') return 'qr_pending';
  if (s === 'STOPPED' || s === 'FAILED') return 'disconnected';
  return 'unknown';
}

// Só aceita endereço HTTPS sem usuário/senha/query/fragmento (mesma regra do envio).
export function normalizeWahaUrl(raw: string): string | null {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

// Escolhe a sessão do escritório: prefere o registro "connected"; ignora registros sem sessão.
export function pickWahaSession(rows: Array<{ status?: string; settings?: Record<string, unknown> | null }>): string | null {
  const valid = (rows || []).filter(r => typeof r?.settings?.waha_session === 'string' && String(r.settings!.waha_session).trim());
  const chosen = valid.find(r => r.status === 'connected') || valid[0];
  return chosen ? String(chosen.settings!.waha_session).trim() : null;
}
