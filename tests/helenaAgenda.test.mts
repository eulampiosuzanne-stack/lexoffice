import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { hearingsToSync } from '../supabase/functions/google-calendar-autosync/hearings.mjs';
import { parsePreference, computeSlots, pickSlot, shouldOpenAgenda, promisesAgendaCheck, agendaTool, spClock } from '../supabase/functions/helena-conversation-run/helena-tools.ts';

const now = new Date('2026-11-26T13:36:00Z'); // quinta, 10h36 em Brasília
const dates = (m: string, busy: any[] = []) => computeSlots(now, 'dra', busy, new Set(), 3, parsePreference(m)).map(s => `${s.date} ${s.hour}`);

test('caso Tatiana: quintas a partir das 16h, ignorando o trecho negado', () => {
  const m = 'A tarde não consigo, pq trabalho, só posso a partir das 16h, qualquer quinta-feira';
  assert.deepEqual(parsePreference(m), { weekday: 4, minHour: 16 });
  assert.deepEqual(dates(m), ['2026-12-03 16', '2026-12-10 16', '2026-12-17 16']);
});
test('semana que vem, duas semanas e data específica', () => {
  assert.equal(dates('pode ser semana que vem?')[0], '2026-11-30 14');
  assert.equal(dates('daqui a duas semanas')[0], '2026-12-07 14');
  assert.deepEqual(dates('dia 15/12 às 15h'), ['2026-12-15 15']);
  assert.equal(dates('10 de dezembro')[0], '2026-12-10 14');
  assert.equal(dates('dia 05/01')[0], '2027-01-05 14'); // virada de ano
});
test('"depois das 16h" e "a partir de 15" são limite mínimo', () => {
  assert.deepEqual(parsePreference('depois das 16h'), { minHour: 16 });
  assert.deepEqual(parsePreference('a partir de 15'), { minHour: 15 });
});
test('sem vaga: sábado, fora do expediente, audiência no dia e horário ocupado', () => {
  assert.deepEqual(dates('só sábado'), []);
  assert.deepEqual(dates('depois das 19h'), []);
  assert.equal(dates('quinta às 16h', [{ starts_at: '2026-12-03T12:00:00Z', event_type: 'hearing' }])[0], '2026-12-10 16');
  assert.equal(dates('quinta às 16h', [{ starts_at: '2026-12-03T19:00:00Z', event_type: 'meeting' }])[0], '2026-12-10 16');
});
test('não confunde "segunda instância/via" nem trechos negados com dia da semana', () => {
  assert.equal(parsePreference('o processo subiu para segunda instância'), null);
  assert.equal(parsePreference('preciso da segunda via'), null);
  assert.equal(parsePreference('quinta não posso'), null);
});
test('pedido de outra semana não reserva horário já oferecido', () => {
  const offered = computeSlots(now, 'dra', [], new Set(), 5);
  assert.equal(pickSlot('quinta da semana que vem', offered), null);
  assert.equal(pickSlot('a partir das 14h', offered), null);
  assert.ok(pickSlot('quinta-feira', offered));
});
test('quando abrir a agenda', () => {
  const offer = 'Posso agendar uma reunião online para você?';
  assert.ok(shouldOpenAgenda('Pode sim', offer, true));
  assert.ok(shouldOpenAgenda('só posso a partir das 16h, quinta', offer, true));
  assert.ok(!shouldOpenAgenda('que horário é a minha audiência?', 'Sobre o seu processo, o que você precisa?', true));
  assert.ok(!shouldOpenAgenda('Pode sim', 'Posso confirmar a movimentação do seu processo?', true));
  assert.ok(!shouldOpenAgenda('Obrigada', offer));
});
test('promessas sem retorno são detectadas', () => {
  assert.ok(promisesAgendaCheck('Perfeito, Tatiana. Vou verificar a próxima quinta-feira às 16h disponível na agenda e confirmo em instantes.'));
  assert.ok(promisesAgendaCheck('Assim que eu tiver a confirmação do horário, te aviso por aqui.'));
  assert.ok(!promisesAgendaCheck('Seu atendimento está confirmado para quinta-feira, 03/12, às 16h.'));
  assert.ok(!promisesAgendaCheck('Qual opção você prefere?'));
});
test('agendaTool devolve os horários pedidos, sem gravar em simulação', async () => {
  const rows = (data: any[]) => { const q: any = new Proxy({}, { get: (_, k) => k === 'then' ? (ok: any) => ok({ data, error: null }) : () => q }); return q; };
  const db = { from: () => rows([]) };
  const r: any = await agendaTool(db, { orgId: 'o', conversationId: 'c', message: 'qualquer quinta a partir das 16h', ctx: {}, clientId: 'x', leadId: null, name: 'T', phone: '1', policyId: 'p', dryRun: true, lastOutbound: 'Posso agendar uma reunião?', strict: true });
  assert.equal(r.slots.length, 3);
  assert.ok(r.slots.every((s: any) => s.hour === 16 && s.dow === 4 && spClock(new Date(s.iso)).getUTCHours() === 16));
});
test('audiências importadas vão ao Google sem duplicar', () => {
  const h = (id: string, extra: any = {}) => ({ id, process_id: 'p1', starts_at: '2027-01-21T18:00:00+00:00', status: 'scheduled', title: 'Audiência', source_calendar_event_id: null, ...extra });
  assert.equal(hearingsToSync([h('a')], []).length, 1);
  assert.equal(hearingsToSync([h('a', { source_calendar_event_id: 'e1' })], [{ id: 'e1', event_type: 'hearing', process_id: 'p1', starts_at: '2027-01-21T18:00:00Z' }]).length, 0);
  assert.equal(hearingsToSync([h('a')], [{ id: 'e2', event_type: 'hearing', process_id: 'p1', starts_at: '2027-01-21T18:00:00Z' }]).length, 0);
});
