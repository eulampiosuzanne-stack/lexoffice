import test from 'node:test';
import assert from 'node:assert/strict';
import { step, choice, parts } from '../supabase/functions/chatbot-botoes/menu.ts';

const open = new Date('2026-11-27T15:00:00Z'); // sexta 12h Brasília
const closed = new Date('2026-11-28T15:00:00Z'); // sábado
const run = (node, input, extra = {}) => step({ node, tries: 0, lastAt: new Date(open - 60000), name: 'Teste', input, attachment: false, now: open, ...extra });

test('início mostra as 5 opções do Word', () => {
  const r = run('new', 'oi');
  assert.equal(r.node, 'menu');
  assert.equal(r.replies[0].menu.rows.length, 5);
  assert.match(r.replies[0].text, /Olá Teste!/);
});
test('botões: no máximo 3 por mensagem, títulos até 20 letras', () => {
  const p = parts(run('new', 'oi').replies[0]);
  assert.deepEqual(p.map((x) => x.buttons.length), [3, 2]);
  for (const b of p.flatMap((x) => x.buttons)) assert.ok([...b.title].length <= 20, b.title);
  assert.equal(run('menu', 'Processo em curso').handoff, 'Processo em andamento');
  assert.equal(run('menu', 'Financeiro').handoff, 'Financeiro');
});
test('opções levam ao destino certo', () => {
  assert.equal(run('menu', '1').handoff, 'Processo em andamento');
  assert.equal(run('menu', 'Novo processo').node, 'novo');
  assert.equal(run('menu', 'sfbot:3').node, 'docs');
  assert.equal(run('menu', ' 4. ').handoff, 'Financeiro');
  assert.equal(run('novo', '2').handoff, 'Novo processo (pessoa jurídica)');
  assert.equal(run('novo', '3').node, 'menu');
});
test('endereço: somente online, voltar sem a opção 5, ou encerrar', () => {
  const r = run('menu', '5');
  assert.match(r.replies[0].text, /somente online/);
  assert.equal(run('endereco', '1').replies[0].menu.rows.length, 4);
  assert.equal(run('endereco', '2').node, 'closed');
  assert.equal(run('menu_curto', '5').tries, 1);
});
test('documento recebido confirma e passa para humano', () => {
  assert.match(run('docs', '', { attachment: true }).replies[0].text, /Identificamos/);
  assert.equal(run('docs', 'já mando').replies.length, 0);
});
test('inválido repete uma vez e depois passa para humano', () => {
  const a = run('menu', 'quero falar');
  assert.equal(a.node, 'menu');
  assert.equal(run('menu', '9', { tries: a.tries }).node, 'handed');
  assert.equal(choice('0', ['a']), 0);
  assert.equal(choice('', ['a']), 0);
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
