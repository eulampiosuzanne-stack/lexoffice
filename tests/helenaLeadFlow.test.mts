import test from 'node:test';
import assert from 'node:assert/strict';
import { leadFlowRules, lawyerBusyRule, TONE_RULES } from '../supabase/functions/helena-conversation-run/lead-flow.mjs';

test('cliente cadastrado nunca entra no fluxo de cobrança', () => {
  assert.equal(leadFlowRules({ isClient: true, agentKey: 'sales', fee: 300 }), '');
});
test('não cliente: triagem antes da cobrança, valor e dias só após pagamento', () => {
  const r = leadFlowRules({ isClient: false, agentKey: 'client_service_triage', fee: 300 });
  assert.ok(r.indexOf('TRIAGEM') < r.indexOf('COBRANÇA'));
  assert.match(r, /R\$ 300,00/);
  assert.match(r, /NÃO ofereça nem confirme dia/);
});
test('reclamação não recebe fluxo de venda; valor ausente usa 300', () => {
  assert.equal(leadFlowRules({ isClient: false, agentKey: 'support_n1', fee: 300 }), '');
  assert.match(leadFlowRules({ isClient: false, agentKey: 'sales', fee: 0 }), /300,00/);
});
test('tom e fora do expediente', () => {
  assert.match(TONE_RULES, /NUNCA use "kkk"/);
  assert.equal(lawyerBusyRule(''), '');
  assert.match(lawyerBusyRule('amanhã'), /volta amanhã/);
});
test('pagamento confirmado: não cobra de novo', () => {
  const r = leadFlowRules({ isClient: false, agentKey: 'client_service_triage', fee: 300, pixInfo: 'Chave PIX X', paid: true });
  assert.match(r, /JÁ CONFIRMADO/);
  assert.doesNotMatch(r, /COBRANÇA|Chave PIX X/);
});
