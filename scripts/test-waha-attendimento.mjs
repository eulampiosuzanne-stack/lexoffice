import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INITIAL, CLIENT, OTHER, isGreeting, routeMenuIntent } from '../supabase/functions/helena-conversation-run/attendimento-menu.mjs';
import { resolveMenuChoice } from '../supabase/functions/helena-conversation-run/menu-choice.mjs';
import { deliveryTransition, incomingMessageType } from '../supabase/functions/waha-message-webhook/events.mjs';
import { interactiveAsText } from '../supabase/functions/whatsapp-outbound-gate/_shared/meta-template.mjs';

test('WAHA fallback preserves each menu option and accepts number or identifier', () => {
  for (const menu of [INITIAL, CLIENT, OTHER]) {
    const text = interactiveAsText('Escolha', { type: 'list', rows: menu });
    for (const [index, item] of menu.entries()) {
      assert.equal(resolveMenuChoice(String(index + 1), menu), item.title);
      assert.equal(resolveMenuChoice(item.id, menu), item.title);
      assert.ok(text.includes(item.description));
    }
  }
});

test('free text bypasses menus and invalid choices are not mapped', () => {
  assert.equal(resolveMenuChoice('Quero enviar um PDF', CLIENT), 'Quero enviar um PDF');
  assert.equal(resolveMenuChoice('9', CLIENT), '9');
  assert.ok(isGreeting('oi, tudo bem?'));
  assert.ok(!isGreeting('oi, quero consultar meu processo'));
});

test('process, payment and scheduling choices reach the corresponding agent', () => {
  for (const [number, agent] of [[1, 'client_process_updates'], [3, 'billing'], [4, 'client_schedule_relationship']]) {
    const choice = resolveMenuChoice(String(number), CLIENT).toLowerCase();
    assert.equal(routeMenuIntent(choice, 'triage'), agent);
  }
  assert.equal(resolveMenuChoice('proc:example', [{ id: 'proc:example', title: 'Processo' }]), '1');
  assert.equal(resolveMenuChoice('slot:1', [{ id: 'slot:1', title: '14h' }]), '1');
});

test('receipts never regress an already read message', () => {
  const payload = { id: 'provider-id', fromMe: true };
  for (const ack of [-1, 1, 2, 3, 4]) {
    assert.ok(!deliveryTransition({ ...payload, ack }, 'now').from.includes('read'));
  }
  assert.equal(deliveryTransition({ ...payload, ackName: 'READ' }, 'now').update.status, 'read');
  assert.equal(deliveryTransition({ ...payload, fromMe: false, ack: 3 }, 'now'), null);
});

test('document, image and audio use permitted database types', () => {
  assert.equal(incomingMessageType({ mimetype: 'application/pdf' }), 'document');
  assert.equal(incomingMessageType({ mimetype: 'image/jpeg' }), 'image');
  assert.equal(incomingMessageType({ mimetype: 'audio/ogg' }), 'audio');
});
