export async function reserveDispatch(db, record) {
  const { error } = await db.from('whatsapp_dispatch_reservations').insert(record);
  if (!error) return { state: 'reserved' };
  if (error.code !== '23505') throw error;
  const current = await dispatchRow(db.from('whatsapp_dispatch_reservations').select('state,external_message_id'), record).single();
  if (current.error) throw current.error;
  return current.data;
}

export async function finishDispatch(db, record, state, externalMessageId = null) {
  const { error } = await dispatchRow(db.from('whatsapp_dispatch_reservations').update({
    state, external_message_id: externalMessageId, updated_at: new Date().toISOString(),
  }), record).eq('state', 'sending');
  if (error) throw error;
}

function dispatchRow(query, record) {
  return query.eq('org_id', record.org_id).eq('dispatch_key', record.dispatch_key).eq('destination', record.destination);
}
