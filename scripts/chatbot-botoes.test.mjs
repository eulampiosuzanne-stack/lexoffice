import test from 'node:test';
import assert from 'node:assert/strict';
import { step, choice, parts, reminder } from '../supabase/functions/chatbot-botoes/menu.ts';


const open = new Date('2026-11-27T15:00:00Z'); // sexta 12h Brasília
const closed = new Date('2026-11-28T15:00:00Z'); // sábado
const run = (node, input, extra = {}) => step({ node, tries: 0, lastAt: new Date(open - 60000), name: 'Teste', input, attachment: false, now: open, ...extra });

test('início: modelo do Word mais consultoria e agendamento', () => {
  const r = run('new', 'oi');
  assert.equal(r.node, 'menu');
  assert.equal(r.replies[0].menu.rows.length, 7);
  assert.match(r.replies[0].text, /Olá \*Teste\*/);
});
test('botões: no máximo 3 por mensagem, até 20 letras', () => {
  const p = parts(run('new', 'oi').replies[0]);
  assert.deepEqual(p.map((x) => x.buttons.length), [3, 3, 1]);
  for (const node of ['menu', 'novo', 'endereco', 'consultoria', 'agenda'])
    for (const row of reminder(node).menu.rows) assert.ok([...row.title].length <= 20, row.title);
});
test('opções por número, por botão e sem o símbolo', () => {
  assert.equal(run('menu', '1').handoff, 'Processo em andamento');
  assert.equal(run('menu', '📂 Meu processo').handoff, 'Processo em andamento');
  assert.equal(run('menu', 'meu processo').handoff, 'Processo em andamento');
  assert.equal(run('menu', 'sfbot:3').node, 'docs');
  assert.equal(run('menu', '💰 Financeiro').handoff, 'Financeiro');
  assert.equal(run('menu', '⚖️ Consultoria').node, 'consultoria');
  assert.equal(run('menu', '📅 Agendamento').node, 'agenda');
  assert.equal(run('novo', '2').handoff, 'Novo processo (pessoa jurídica)');
  assert.equal(run('novo', '↩️ Voltar ao menu').node, 'menu');
});
test('consultoria informa o valor; agendamento só depois do pagamento', () => {
  assert.match(run('menu', '6').replies[0].text, /300,00[\s\S]*somente depois/);
  assert.match(run('menu', '7').replies[0].text, /somente depois/);
  assert.match(run('consultoria', '1').handoff, /pagamento/);
  assert.match(run('agenda', '1').handoff, /conferir/);
  assert.equal(run('agenda', '2').node, 'consultoria');
});
test('endereço: somente online, voltar ou encerrar', () => {
  assert.match(run('menu', '5').replies[0].text, /somente online/);
  assert.equal(run('endereco', '1').node, 'menu');
  assert.equal(run('endereco', '2').node, 'closed');
});
test('documento recebido confirma', () => {
  assert.match(run('docs', '', { attachment: true }).replies[0].text, /Identificamos/);
  assert.equal(run('docs', 'já mando').replies.length, 0);
});
test('sem clicar: avisa para escolher, duas vezes, depois passa para humano', () => {
  assert.match(run('menu', 'quero falar').replies[0].text, /escolher uma das opções/);
  assert.equal(run('menu', 'x', { tries: 1 }).tries, 2);
  assert.equal(run('menu', '9', { tries: 2 }).node, 'handed');
  assert.match(reminder('menu').text, /escolher uma das opções/);
  assert.equal(reminder('handed'), null);
  assert.equal(choice('0', ['a']), 0);
  assert.equal(choice('12', ['a', 'b']), 0);
});
test('depois de passar para humano fica calado; reinicia após 12h', () => {
  assert.equal(run('handed', '1').replies.length, 0);
  assert.equal(run('handed', 'oi', { lastAt: new Date(open - 13 * 3600000) }).node, 'menu');
});
test('fora do horário avisa uma vez', () => {
  const r = run('new', 'oi', { now: closed, lastAt: null });
  assert.match(r.replies[0].text, /Não estamos atendendo/);
  assert.equal(run('offhours', 'oi', { now: closed, lastAt: new Date(closed - 60000) }).replies.length, 0);
});
