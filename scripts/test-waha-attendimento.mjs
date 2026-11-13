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
      assert.equal(resolveMenuChoice(String(index + 1), menu), item.title.replace(/^[\p{Extended_Pictographic}\u200D\uFE0F]+\s*/u, ''));
      assert.equal(resolveMenuChoice(item.id, menu), item.title.replace(/^[\p{Extended_Pictographic}\u200D\uFE0F]+\s*/u, ''));
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

test('concurrent dispatches reserve once and ambiguous sends stay blocked', async () => {
  const { reserveDispatch, finishDispatch } = await import('../supabase/functions/whatsapp-outbound-gate/_shared/dispatch-reservation.mjs');
  const rows = new Map();
  const keyOf = row => JSON.stringify([row.org_id, row.dispatch_key, row.destination]);
  const db = { from() {
    let update, filters = {};
    const query = {
      async insert(row) {
        const key = keyOf(row);
        if (rows.has(key)) return { error: { code: '23505' } };
        rows.set(key, { ...row, state: 'sending' });
        return {};
      },
      select() { return query; },
      update(data) { update = data; return query; },
      eq(key, value) { filters[key] = value; return query; },
      async single() { return { data: rows.get(keyOf(filters)) }; },
      then(resolve) {
        const row = rows.get(keyOf(filters));
        if (row?.state === filters.state) Object.assign(row, update);
        resolve({});
      },
    };
    return query;
  } };
  const record = { org_id: 'office-a', dispatch_key: 'event-1', destination: 'recipient-a' };
  const claims = await Promise.all(Array.from({ length: 12 }, () => reserveDispatch(db, record)));
  assert.equal(claims.filter(claim => claim.state === 'reserved').length, 1);
  await finishDispatch(db, record, 'uncertain');
  assert.equal((await reserveDispatch(db, record)).state, 'uncertain');
  const anotherOffice = { ...record, org_id: 'office-b' };
  assert.equal((await reserveDispatch(db, anotherOffice)).state, 'reserved');
  await finishDispatch(db, anotherOffice, 'accepted', 'provider-id');
  assert.equal((await reserveDispatch(db, anotherOffice)).external_message_id, 'provider-id');
  assert.equal((await reserveDispatch(db, { ...record, destination: 'recipient-b' })).state, 'reserved');
});

test('Helena classifies requests and keeps sensitive data in the authenticated app', async () => {
  const { decideConversation, needsSecureChannel } = await import('../supabase/functions/helena-conversation-run/decisions.mjs');
  const examples = {
    'Meu processo': 'case', 'Quero segunda via': 'finance', 'Preciso enviar um PDF': 'document',
    'Quero agendar': 'schedule', 'Quero falar com a Dra.': 'lawyer',
    'Preciso de atendimento humano': 'human', 'Quero reclamar': 'complaint',
    'Sofri ameaça': 'urgent', 'Quero propor uma parceria': 'administrative', 'Não entendi': 'clarify',
  };
  for (const [message, expected] of Object.entries(examples)) assert.equal(decideConversation(message), expected);
  assert.equal(decideConversation('E agora?', 'client_process_updates'), 'case');
  assert.equal(decideConversation('E agora?', 'billing'), 'finance');
  assert.equal(decideConversation('Preciso agendar', 'billing'), 'schedule');
  assert.ok(needsSecureChannel('case', false));
  assert.ok(needsSecureChannel('finance', true));
  assert.ok(!needsSecureChannel('finance', false));
});
