export type SignupAssets = { waba_id: string; phone_number_id: string; business_id?: string };
export function signupAssets(origin: string, payload: unknown): SignupAssets | null {
  if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(origin)) return null;
  try {
    const event = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (event?.type !== 'WA_EMBEDDED_SIGNUP' || !['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(event.event)) return null;
    const data = event.data;
    if (!/^\d+$/.test(String(data?.waba_id || '')) || !/^\d+$/.test(String(data?.phone_number_id || ''))) return null;
    return {waba_id: String(data.waba_id), phone_number_id: String(data.phone_number_id), ...(/^\d+$/.test(String(data.business_id || '')) ? {business_id: String(data.business_id)} : {})};
  } catch { return null; }
}
export function validMetaConnection(connection: any): boolean {
  return connection?.status === 'connected' && /^\d+$/.test(String(connection?.settings?.waba_id || '')) && /^\d+$/.test(String(connection?.settings?.phone_number_id || ''));
}
