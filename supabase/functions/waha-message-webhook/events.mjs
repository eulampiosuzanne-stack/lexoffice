const ackNames = new Map([
  ['ERROR', -1], ['PENDING', 0], ['SERVER', 1],
  ['DEVICE', 2], ['READ', 3], ['PLAYED', 4],
]);

export function deliveryTransition(payload, now) {
  if (payload?.fromMe !== true || typeof payload.id !== 'string' || !payload.id.trim()) return null;
  const ack = ackNames.get(payload.ackName) ?? payload.ack;
  switch (ack) {
    case -1: return { from: ['pending', 'sent'], update: { status: 'failed', error_message: 'WAHA delivery error' } };
    case 1: return { from: ['pending', 'failed'], update: { status: 'sent', error_message: null } };
    case 2: return { from: ['pending', 'sent', 'failed'], update: { status: 'delivered', delivered_at: now, error_message: null } };
    case 3:
    case 4: return { from: ['pending', 'sent', 'failed', 'delivered'], update: { status: 'read', read_at: now, error_message: null } };
    default: return null;
  }
}

export function incomingMessageType(media) {
  if (!media) return 'text';
  const family = String(media.mimetype ?? media.mimeType ?? '').toLowerCase().split('/')[0];
  return ['image', 'audio', 'video'].includes(family) ? family : 'document';
}
