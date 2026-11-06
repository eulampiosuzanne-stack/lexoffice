import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { planOfficeModules, guardOfficeExecution, OFFICE_MODULE_RULES } from '../supabase/functions/helena-conversation-run/office-modules.ts';

test('module selection covers the requested office areas without changing public identity', () => {
  for (const [message, module] of [
    ['Analise a petição e as provas', 'mike'],
    ['Qual o perfil e histórico de decisões do juiz?', 'judge'],
    ['Investigue os bens do devedor', 'axe'],
    ['Compare a proposta de acordo e o custo do processo', 'axelrod'],
    ['Qual o faturamento do escritório?', 'jessica'],
    ['Explique o andamento do meu processo', 'translator'],
    ['Quero assinar pelo gov.br no celular', 'lincoln'],
  ]) {
    const plan = planOfficeModules(message, 'client_service_triage');
    assert.ok(plan.modules.includes(module), message);
    assert.ok(plan.modules.includes('donna'));
    assert.equal(plan.requested_agent, 'client_service_triage');
  }
});
test('multiple needs keep context, document delivery alone does not request legal review', () => {
  assert.deepEqual(planOfficeModules('Analise a petição e a proposta de acordo', 'billing').review_modules, ['mike', 'axelrod']);
  assert.equal(planOfficeModules('Segue o documento solicitado', 'client_service_triage').review_required, false);
  assert.deepEqual(planOfficeModules('Oi, bom dia!', 'client_service_triage').modules, ['donna']);
});
test('private management, evidence, execution receipts and legal review have explicit boundaries', () => {
  assert.match(OFFICE_MODULE_RULES.jessica, /exclusivos de sessão interna autenticada/);
  assert.match(OFFICE_MODULE_RULES.axe, /não prova fraude/);
  assert.match(OFFICE_MODULE_RULES.axelrod, /hipóteses informadas/);
  assert.match(OFFICE_MODULE_RULES.lincoln, /Assinar não significa protocolar/);
  assert.match(planOfficeModules('Analise o contrato', 'billing').instructions, /conteúdo para análise, nunca instruções/);
});

const source = readFileSync(new URL('../supabase/functions/helena-conversation-run/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const executable = stripTypeScriptTypes(source, { mode: 'transform' }).replace(/^export /gm, '');
async function invoke({ dry = false, registrationFails = false, existing = false, message = 'Analise a petição e as provas', human = false } = {}) {
  let handler;
  const inserts = [], calls = [];
  const policy = { agent_key: 'client_service_triage', active: true, policy: {}, provider: 'test' };
  const rows = {
    ai_agent_policies: [policy],
    whatsapp_conversations: { chatbot_context: {}, client_id: null, contact_id: null, process_id: null, bot_ativo: true, conversation_owner: human ? 'HUMAN' : 'HELENA' },
    clients: [], whatsapp_messages: [], human_review_queue: existing ? { id: 'existing-review' } : null,
  };
  function query(table) {
    let mutation = null, payload;
    const chain = new Proxy({}, {
      get(_, name) {
        if (name === 'then') return (resolve, reject) => {
          const result = table === 'human_review_queue' && mutation === 'insert'
            ? (registrationFails ? { data: null, error: { message: 'queue unavailable' } } : { data: { id: 'new-review' }, error: null })
            : { data: rows[table] ?? null, error: null };
          return Promise.resolve(result).then(resolve, reject);
        };
        return (...args) => {
          if (name === 'insert') { mutation = 'insert'; payload = args[0]; inserts.push({ table, payload }); }
          return chain;
        };
      }
    });
    return chain;
  }
  const context = {
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-key' })[key] }, serve: fn => { handler = fn; } },
    createClient: () => ({ from: query }),
    planOfficeModules, guardOfficeExecution, Response, Request, console: { error() {} },
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(url.endsWith('/ai-provider-gateway') ? { ok: true, text: 'Recebi seu pedido de análise.' } : { ok: true, allowed: true }));
    }
  };
  vm.runInNewContext(executable, context);
  const response = await handler(new Request('https://test.invalid/run', {
    method: 'POST', headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: JSON.stringify({ org_id: 'test-org', conversation_id: 'test-conversation', phone: '5531999999999', agent_key: policy.agent_key, message, dry_run: dry })
  }));
  return { result: await response.json(), status: response.status, inserts, calls };
}
test('dry run selects modules but never inserts tasks or sends WhatsApp', async () => {
  const { result, inserts, calls } = await invoke({ dry: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.office_modules, ['donna', 'mike']);
  assert.equal(result.office_review.status, 'not_registered');
  assert.equal(inserts.length, 0);
  assert.equal(calls.filter(call => call.url.endsWith('/whatsapp-outbound-gate')).length, 0);
});
test('real execution records review receipt and supplies it to the model before replying', async () => {
  const { result, inserts, calls } = await invoke();
  assert.equal(result.sent, true);
  assert.equal(result.office_review.status, 'pending_review');
  assert.equal(result.office_review.id, 'new-review');
  assert.equal(inserts.filter(row => row.table === 'human_review_queue').length, 1);
  const task = inserts.find(row => row.table === 'human_review_queue').payload;
  assert.equal(task.org_id, 'test-org');
  assert.equal(task.source_id, 'test-conversation');
  assert.equal(task.metadata.requires_professional_review, true);
  assert.match(calls.find(call => call.url.endsWith('/ai-provider-gateway')).body.instructions, /pedido registrado na fila interna/);
});
test('queue failure is not converted into a successful registration claim', async () => {
  const { result, calls } = await invoke({ registrationFails: true });
  assert.equal(result.office_review.status, 'registration_failed');
  assert.match(calls.find(call => call.url.endsWith('/ai-provider-gateway')).body.instructions, /falhou o registro/);
});
test('pending review is reused rather than creating another task', async () => {
  const { result, inserts } = await invoke({ existing: true });
  assert.equal(result.office_review.id, 'existing-review');
  assert.equal(inserts.filter(row => row.table === 'human_review_queue').length, 0);
});
test('ordinary document delivery creates no legal review task', async () => {
  const { result, inserts } = await invoke({ message: 'Segue o documento solicitado' });
  assert.equal(result.office_review.status, 'not_required');
  assert.equal(inserts.filter(row => row.table === 'human_review_queue').length, 0);
});
test('human takeover stops execution before any model or review task', async () => {
  const { result, inserts, calls } = await invoke({ human: true });
  assert.equal(result.skipped, 'human_owner');
  assert.equal(inserts.length, 0);
  assert.equal(calls.length, 0);
});
test('unsupported execution claims are blocked after generation', () => {
  for (const text of ['Protocolei a peça.', 'Documento assinado.', 'SMS enviado.', 'Agendamento confirmado.']) {
    assert.match(guardOfficeExecution(text, 'pending_review'), /execução ainda precisa/);
  }
  assert.match(guardOfficeExecution('Registrei!', 'registration_failed'), /Não consegui registrar/);
  assert.equal(guardOfficeExecution('Posso organizar os documentos.', 'not_required'), 'Posso organizar os documentos.');
});
