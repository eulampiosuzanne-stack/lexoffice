// Regra única para saber se o canal de WhatsApp do escritório está conectado (WAHA, Evolution ou Hub).
export type ChannelRow = { provider?: unknown; status?: unknown; settings?: Record<string, unknown> | null };
const OK = ['active', 'connected', 'online', 'ok'];
const truthy = (v: unknown) => v === true || String(v).toLowerCase() === 'true';

export function isOfficeChannelConnected(rows: ChannelRow[] | null | undefined): boolean {
  return (rows || []).some(x => {
    const p = String(x?.provider || '').toLowerCase();
    const sp = String(x?.settings?.provider || '').toLowerCase();
    const status = String(x?.status || '').toLowerCase();
    if (!OK.includes(status)) return false;
    // WAHA só vale com o canal habilitado; Evolution/Univitta/Hub mantêm a regra antiga.
    if (sp === 'waha') return truthy(x?.settings?.channel_enabled);
    return p.includes('evolution') || p.includes('univitta') || p.includes('hub') || sp.includes('evolution') || sp.includes('univitta');
  });
}
