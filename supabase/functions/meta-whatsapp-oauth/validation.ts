export function requireAssets(body: any) {
  const wabaId = String(body?.waba_id || '');
  const phoneId = String(body?.phone_number_id || '');
  if (!/^\d+$/.test(wabaId) || !/^\d+$/.test(phoneId)) throw new Error('A Meta precisa devolver uma WABA e um identificador de telefone válidos.');
  return { wabaId, phoneId };
}
export function assertToken(data: any, appId: string, wabaId: string) {
  if (data?.is_valid !== true || String(data.app_id) !== appId) throw new Error('Token inválido ou emitido para outro aplicativo.');
  const scopes = data.scopes || [];
  if (!['whatsapp_business_management', 'whatsapp_business_messaging'].every(scope => scopes.includes(scope))) throw new Error('A autorização não inclui as permissões necessárias do WhatsApp.');
  const management = (data.granular_scopes || []).filter((scope: any) => scope.scope === 'whatsapp_business_management');
  if (!management.some((scope: any) => (scope.target_ids || []).map(String).includes(wabaId))) throw new Error('A WABA selecionada não está incluída nesta autorização.');
}
export function selectPhone(phones: any[], phoneId: string) {
  const phone = phones.find(item => String(item.id) === phoneId);
  if (!phone?.display_phone_number) throw new Error('O número selecionado não pertence à WABA autorizada.');
  return phone;
}
