import test from 'node:test';
import assert from 'node:assert/strict';
import { pickEntry, settleInstallment } from '../supabase/functions/whatsapp-media-intake/settle.mjs';

const now = Date.parse('2026-11-27T12:00:00Z');
const entries = [
  { id: 'b', amount: 500, due_date: '2026-11-10', status: 'overdue' },
  { id: 'a', amount: '500.00', due_date: '2026-10-10', status: 'overdue' },
  { id: 'c', amount: 500, due_date: '2027-03-10', status: 'pending' },
  { id: 'd', amount: 700, due_date: '2026-10-01', status: 'paid' },
];
function fakeDb({ used = [], open = entries, updated = [{ id: 'a' }] } = {}) {
  const log = [];
  return { log, from(table) {
    const q = { op: 'select' };
    const chain = new Proxy({}, { get(_, k) {
      if (k === 'then') return (res) => res(q.op === 'insert' ? {} : q.op === 'update' ? { data: updated } : { data: table === 'payment_receipts' ? used : open });
      return (arg) => { if (k === 'insert' || k === 'update') { q.op = k; log.push([table, k, arg]); } return chain; };
    } });
    return chain;
  } };
}
const check = { ok: true, amount: 500, reference: 'e1', paidAt: '2026-11-27T11:00:00Z' };
const args = (c = check) => ({ orgId: 'o', ownerId: 'u', clientId: 'cli', who: 'Maria', check: c, now });

test('escolhe a mais antiga de mesmo valor; ignora paga e vencimento distante', () => {
  assert.equal(pickEntry(entries, 500, now).id, 'a');
  assert.equal(pickEntry(entries, 700, now), null);
  assert.equal(pickEntry([entries[2]], 500, now), null);
  assert.equal(pickEntry(entries, 499.5, now), null);
});
test('comprovante certo dá baixa e avisa', async () => {
  const db = fakeDb();
  assert.match(await settleInstallment(db, args()), /PARCELA PAGA[\s\S]*10\/10\/2026/);
  assert.deepEqual(db.log.map((l) => l[0] + ':' + l[1]), ['payment_receipts:insert', 'financial_entries:update', 'notification_queue:update']);
});
test('na dúvida não altera nada', async () => {
  for (const [opt, c] of [[{}, { ok: false, reason: 'x' }], [{}, { ...check, amount: 123 }], [{ used: [{ client_id: 'outro' }] }, check], [{ used: [{ client_id: 'cli' }] }, check]]) {
    const db = fakeDb(opt);
    const msg = await settleInstallment(db, args(c));
    assert.equal(db.log.length, 0);
    assert.doesNotMatch(msg, /PARCELA PAGA/);
  }
});
test('se a parcela não muda, não diz que baixou', async () => {
  assert.match(await settleInstallment(fakeDb({ updated: [] }), args()), /NÃO dei baixa/);
});
