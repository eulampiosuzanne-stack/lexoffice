import assert from 'node:assert/strict';
import test from 'node:test';

// Regression contract for the ACTIVE modular Supabase Helena function (v58).
// Do not deploy the legacy monolithic function from this branch over production.
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const greetingOnly = (s) => /^(?:(?:bom dia|boa tarde|boa noite|oi|ola|opa|alo|hey)[!,.?\\s]*)?(?:(?:dra\\.?|doutora)\\s*)?suzanne\\s*[?!.,]*$/.test(norm(s)) || /^(?:bom dia|boa tarde|boa noite|oi|ola|opa|alo|hey)[!,.?\\s]*$/.test(norm(s));
const greetingReply = (clientId) => clientId
  ? 'Bom dia! Sou Helena, da equipe da Dra. Suzanne. Como posso ajudar você hoje?'
  : 'Bom dia! Sou Helena, da equipe da Dra. Suzanne. Você já é cliente do escritório?';

test('greetings are triaged, never transferred', () => {
  for (const s of ['Bom dia! Suzanne?', 'Suzanne?', 'Bom dia!', 'Boa tarde, doutora Suzanne']) assert.equal(greetingOnly(s), true, s);
  for (const s of ['Quero falar com Suzanne', 'Minha audiência é hoje', 'Preciso de ajuda urgente', 'Quero saber meu processo']) assert.equal(greetingOnly(s), false, s);
});
test('known client gets service question', () => assert.match(greetingReply('client-123'), /Como posso ajudar/));
test('unknown contact gets one client identification question', () => assert.match(greetingReply(null), /Você já é cliente/));
test('greeting does not promise human escalation', () => {
  assert.doesNotMatch(greetingReply(null), /encaminh|avis|retorn|entrar em contato/i);
});
