import test from 'node:test';
import assert from 'node:assert/strict';
import { openUrgency, labelContact, hasDetail, urgencyReply, urgencyInstructions } from '../supabase/functions/helena-conversation-run/urgency.mjs';

test('contato enviado não vira o nome da pessoa', () => {
  const t = labelContact('Eduardo Teste\nPhone: +55 35 90000-0000');
  assert.match(t, /CONTATO de outra pessoa: Eduardo Teste/);
  assert.equal(labelContact('é urgente'), 'é urgente');
});
test('"é urgente" ainda não é o motivo', () => {
  for (const m of ['é urgente', 'Sim', 'socorro', 'Dra é muito urgente por favor']) assert.equal(hasDetail(m), false, m);
  assert.equal(hasDetail('é urgente, ele está no meu portão'), true);
  assert.equal(hasDetail('Fulano Teste\nPhone: +55 35 90000-0000'), false);
});
test('primeira resposta acolhe, pergunta e orienta 190/192', () => {
  const r = urgencyReply('', { first: true, name: 'Maria Teste', alerted: true });
  assert.match(r, /Maria/); assert.match(r, /o que está acontecendo\?/); assert.match(r, /190/); assert.match(r, /192/);
  assert.match(urgencyReply('Estou aqui. O que houve?', { first: true, name: '', alerted: true }), /190/);
});
test('nunca oferece agenda nem valor em urgência', () => {
  for (const bad of ['Temos horários: segunda 30/11', 'Posso agendar uma reunião?', 'A consulta é R$ 300']) {
    assert.doesNotMatch(urgencyReply(bad, { first: false, name: '', alerted: true }), /agend|reuni|hor[aá]rio|consulta|R\$/i);
  }
});
test('sem aviso confirmado não diz que avisou', () => {
  assert.doesNotMatch(urgencyReply('', { first: true, name: '', alerted: false }), /avisei/i);
  assert.match(urgencyInstructions({ name: '', alerted: false }), /NÃO diga que a Dra/);
});
test('modo urgência dura 3 horas', () => {
  const now = Date.parse('2026-11-27T22:00:00Z');
  assert.ok(openUrgency({ urgency: { since: '2026-11-27T20:00:00Z' } }, now));
  assert.equal(openUrgency({ urgency: { since: '2026-11-27T18:00:00Z' } }, now), null);
  assert.equal(openUrgency(null, now), null);
});
