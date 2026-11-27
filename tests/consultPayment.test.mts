import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmConsultPayment, parseAmount } from '../src/lib/consultPayment.ts';

function fake(o: any = {}) {
  const inserts: any[] = [];
  const db = { from: (t: string) => {
    const q: any = { select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: { lead_id: t === 'whatsapp_conversations' ? o.convLead ?? null : o.contactLead ?? null } }),
      limit: async () => ({ data: o.prev || [], error: o.prevError || null }),
      insert: async (v: any) => { inserts.push(v); return { error: o.insError || null }; } };
    return q;
  } };
  return { db, inserts };
}
const base = { orgId: 'o', userId: 'u', conversationId: 'c', contactId: 'k', amount: 300 };

test('registra uma vez, usando o lead do contato', async () => {
  const f = fake({ contactLead: 'L' });
  assert.match(await confirmConsultPayment(f.db, base), /confirmado/);
  assert.equal(f.inserts.length, 1);
  assert.equal(f.inserts[0].lead_id, 'L');
  assert.equal(f.inserts[0].owner_user_id, 'u');
});
test('não registra: duplicado, sem lead, valor inválido, erro de consulta', async () => {
  for (const [o, input] of [[{ convLead: 'L', prev: [{ id: 1 }] }, base], [{}, base], [{ convLead: 'L' }, { ...base, amount: NaN }], [{ convLead: 'L' }, { ...base, amount: 0 }], [{ convLead: 'L', prevError: {} }, base]] as any[]) {
    const f = fake(o);
    await confirmConsultPayment(f.db, input);
    assert.equal(f.inserts.length, 0);
  }
});
test('erro ao gravar é informado', async () => {
  assert.match(await confirmConsultPayment(fake({ convLead: 'L', insError: {} }).db, base), /Não foi possível registrar/);
});
test('valor digitado', () => {
  assert.equal(parseAmount('300'), 300);
  assert.equal(parseAmount('R$ 1.250,50'), 1250.5);
  assert.equal(parseAmount('300.00'), 300);
  assert.equal(parseAmount('1.250'), 1250);
  assert.ok(Number.isNaN(parseAmount('abc')));
});
