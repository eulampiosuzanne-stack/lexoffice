import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveRequestedFile, chooseDocument } from '../supabase/functions/whatsapp-media-intake/inbox.ts';

// Banco falso em memória: só o que o fluxo usa. Nenhum dado real.
function fakeDb(tables: Record<string, any[]>) {
  let n = 0;
  const from = (name: string) => {
    const t = (tables[name] ||= []);
    const f: ((r: any) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' = 'select', payload: any;
    const run = () => {
      if (op === 'insert') { const r = { id: `${name}-${++n}`, status: name === 'whatsapp_document_inbox' ? 'waiting' : undefined, created_at: new Date().toISOString(), ...payload }; t.push(r); return [r]; }
      const found = t.filter(r => f.every(x => x(r)));
      if (op === 'update') found.forEach(r => Object.assign(r, payload));
      return found.map(r => ({ ...r }));
    };
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      insert: (p: any) => (op = 'insert', payload = p, q), update: (p: any) => (op = 'update', payload = p, q),
      eq: (k: string, v: any) => (f.push(r => r[k] === v), q), neq: (k: string, v: any) => (f.push(r => r[k] !== v), q),
      in: (k: string, v: any[]) => (f.push(r => v.includes(r[k])), q), gt: (k: string, v: any) => (f.push(r => r[k] > v), q),
      single: async () => ({ data: run()[0] || null }), maybeSingle: async () => ({ data: run()[0] || null }),
      then: (ok: any) => ok({ data: run(), error: null }),
    };
    return q;
  };
  return {
    tables, from,
    storage: { from: () => ({ upload: async () => ({}), remove: async () => ({}) }) },
    rpc: async (fn: string, a: any) => {
      if (fn !== 'lex_claim_document_list') return { data: null };
      const rows = tables.whatsapp_document_inbox;
      if (rows.some(r => r.status === 'waiting' && r.list_sent_at)) return { data: false };
      Object.assign(rows.find(r => r.id === a.p_inbox), { list_sent_at: new Date().toISOString(), options: a.p_options });
      return { data: true };
    },
  };
}

const sent: any[] = [];
(globalThis as any).fetch = async (url: string, init?: any) => {
  if (init?.method === 'POST') { sent.push({ url, body: JSON.parse(init.body) }); return new Response('{}'); }
  return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/octet-stream' } });
};
const base = () => fakeDb({
  system_runtime_secrets: [{ key: 'uazapi_base_url', secret: 'https://x.test' }, { key: 'uazapi_instance_token', secret: 't' }],
  whatsapp_contacts: [{ id: 'ct', org_id: 'o', client_id: 'cl', phone: '5500000000000', name: 'Cliente Teste' }],
  whatsapp_conversations: [{ id: 'cv', org_id: 'o', contact_id: 'ct', status: 'open' }],
  client_document_requests: [{ id: 'r1', org_id: 'o', client_id: 'cl', title: 'RG', status: 'pending', process_id: 'p1' }, { id: 'r2', org_id: 'o', client_id: 'cl', title: 'Holerite', status: 'pending', process_id: 'p1' }],
});
const file = (mid: string) => ({ org: 'o', phone: '5500000000000', variants: ['5500000000000'], pushName: '', url: 'https://x.test/f', mid, filename: '', mime: '', label: 'imagem' });
const pick = (db: any, row: string, body = '') => { const id = 'msg' + Math.random(); (db.tables.whatsapp_messages ||= []).push({ id, org_id: 'o', conversation_id: 'cv', direction: 'inbound', body, metadata: row ? { selected_row_id: row } : {}, created_at: new Date().toISOString() }); return chooseDocument(db, id); };

test('duas fotos: uma lista só; escolha dá baixa e liga ao processo', async () => {
  sent.length = 0; const db: any = base();
  assert.equal((await receiveRequestedFile(db, file('m1')) as any).list, 'sent');
  assert.equal((await receiveRequestedFile(db, file('m2')) as any).list, 'already_sent');
  assert.equal((await receiveRequestedFile(db, file('m2')) as any).duplicate, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(db.tables.documents.map((d: any) => d.mime_type), ['image/jpeg', 'image/jpeg']);
  assert.equal((await pick(db, 'docreq:r1') as any).linked, 2);
  assert.deepEqual(db.tables.documents.map((d: any) => [d.name, d.process_id]), [['RG (1).jpg', 'p1'], ['RG (2).jpg', 'p1']]);
  assert.equal(db.tables.client_document_requests[0].status, 'received');
  assert.equal(db.tables.client_document_requests[1].status, 'pending');
  assert.match(sent.at(-1).body.text, /Ainda falta:\n• Holerite/);
  assert.equal((await pick(db, 'docreq:r1') as any).ignored, 'no_files');
});
test('número inválido mantém o arquivo esperando; "outro" não dá baixa', async () => {
  const db: any = base();
  await receiveRequestedFile(db, file('m3'));
  assert.equal((await pick(db, '', '9') as any).ignored, 'invalid_choice');
  assert.equal(db.tables.whatsapp_document_inbox[0].status, 'waiting');
  assert.equal((await pick(db, '', '3') as any).request, 'other');
  assert.ok(db.tables.client_document_requests.every((r: any) => r.status === 'pending'));
});
test('sem pedido pendente ou sem cliente: não faz nada', async () => {
  const db: any = base(); db.tables.client_document_requests = [];
  assert.equal(await receiveRequestedFile(db, file('m4')), null);
  const other: any = base(); other.tables.whatsapp_contacts = [];
  assert.equal(await receiveRequestedFile(other, file('m5')), null);
});
