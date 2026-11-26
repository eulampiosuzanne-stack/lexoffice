import test from 'node:test';
import assert from 'node:assert/strict';
import { afterHours, afterHoursNotice, saysUrgent } from '../supabase/functions/helena-conversation-run/after-hours.mjs';

const at = (s: string) => afterHours(new Date(s + '-03:00'));

test('expediente aberto: seg-sex 8h às 18h', () => {
  assert.equal(at('2026-11-26T08:00:00'), null);
  assert.equal(at('2026-11-26T17:59:00'), null);
});
test('noite, madrugada e fim de semana', () => {
  assert.deepEqual(at('2026-11-26T18:29:00'), { period: '2026-11-27', when: 'amanhã a partir das 8h' });
  assert.deepEqual(at('2026-11-27T07:59:00'), { period: '2026-11-27', when: 'hoje a partir das 8h' });
  assert.equal(at('2026-11-27T18:00:00')?.when, 'na segunda-feira a partir das 8h');
  assert.equal(at('2026-11-28T10:00:00')?.period, '2026-11-30');
  assert.equal(at('2026-11-29T20:00:00')?.when, 'amanhã a partir das 8h');
  assert.equal(at('2026-12-31T19:00:00')?.period, '2027-01-01');
});
test('aviso pergunta se é urgência', () => {
  assert.match(afterHoursNotice('amanhã'), /É urgência\?/);
});
test('reconhece urgência e não confunde negação', () => {
  assert.equal(saysUrgent('URGENTE'), true);
  assert.equal(saysUrgent('[Áudio transcrito automaticamente] doutora é urgente'), true);
  assert.equal(saysUrgent('sim', true), true);
  assert.equal(saysUrgent('sim', false), false);
  assert.equal(saysUrgent('não é urgente', true), false);
  assert.equal(saysUrgent('sem urgência'), false);
  assert.equal(saysUrgent('Não, pode ser urgente sim'), true);
  assert.equal(saysUrgent('bom dia', true), false);
  assert.equal(saysUrgent('', true), false);
});
