import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, hoursFor, dueHours, phoneFromDescription, reminderText } from '../supabase/functions/appointment-reminder-worker/reminder.mjs';

const helena = { event_type: 'meeting', starts_at: '2026-12-02T17:00:00Z', created_at: '2026-11-26T12:00:00Z',
  description: 'Agendada pela Helena via WhatsApp. Contato: 553188887777. Com: Dra. Suzanne.', meeting_url: 'https://meet.google.com/abc-defg-hij' };
const at = (iso) => new Date(iso).getTime();

test('reunião da Helena entra; reunião interna não', () => {
  assert.equal(eligible(helena), true);
  assert.equal(eligible({ event_type: 'meeting', description: 'Reunião da equipe. Contato: 5531999999999' }), false);
  assert.equal(eligible({ event_type: 'meeting', description: null }), false);
  assert.equal(eligible({ event_type: 'consultation' }), true);
});
test('véspera e 1 hora antes', () => {
  const h = hoursFor(helena, [24, 3]);
  assert.deepEqual(h, [24, 1]);
  assert.deepEqual(dueHours(helena, h, at('2026-12-01T16:00:00Z')), []);
  assert.deepEqual(dueHours(helena, h, at('2026-12-01T17:05:00Z')), [24]);
  assert.deepEqual(dueHours(helena, h, at('2026-12-02T16:05:00Z')), [1, 24]);
});
test('marcada em cima da hora não recebe aviso atrasado', () => {
  const ev = { ...helena, created_at: '2026-12-02T14:00:00Z' };
  assert.deepEqual(dueHours(ev, [24, 1], at('2026-12-02T14:05:00Z')), []);
  assert.deepEqual(dueHours(ev, [24, 1], at('2026-12-02T16:05:00Z')), [1]);
});
test('telefone de quem não é cliente vem da descrição', () => {
  assert.equal(phoneFromDescription(helena), '553188887777');
  assert.equal(phoneFromDescription({ description: 'Contato: 553188887777' }), '');
});
test('texto tem dia, hora e link; sem link não inventa', () => {
  const t = reminderText(helena, at('2026-12-01T17:05:00Z'));
  assert.match(t, /amanhã, às 14:00 \(com Dra\. Suzanne\)/);
  assert.match(t, /https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(reminderText(helena, at('2026-12-02T16:05:00Z')), /hoje, às 14:00/);
  assert.doesNotMatch(reminderText({ ...helena, meeting_url: null }, 0), /Link/);
  assert.doesNotMatch(reminderText({ ...helena, event_type: 'consultation', description: 'x' }, 0), /Helena|com /);
});
