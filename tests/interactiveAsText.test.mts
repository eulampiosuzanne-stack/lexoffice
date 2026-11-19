import assert from 'node:assert/strict';
import { interactiveAsText } from '../supabase/functions/whatsapp-outbound-gate/_shared/meta-template.mjs';

let ok = 0;
const t = (name: string, fn: () => void) => { fn(); ok++; console.log('ok -', name); };

const list = (rows: any[]) => ({ type: 'list', rows });

t('sem interativo devolve a mensagem intacta', () => {
  assert.equal(interactiveAsText('Oi', null), 'Oi');
  assert.equal(interactiveAsText('Oi', list([])), 'Oi');
  assert.equal(interactiveAsText('Oi', { type: 'list' }), 'Oi');
});

t('menu sem número solto, com emoji em negrito e descrição', () => {
  const out = interactiveAsText('Como posso ajudar?', list([
    { id: 'p', title: '📂 Processos', description: 'Andamentos e prazos' },
    { id: 'd', title: '📄 Documentos' },
  ]));
  assert.ok(out.startsWith('Como posso ajudar?\n\n'));
  assert.ok(out.includes('📂 *Processos*\nAndamentos e prazos'));
  assert.ok(out.includes('📄 *Documentos*'));
  assert.ok(!/^\s*\d+\)/m.test(out), 'não pode ter "1)"');
  assert.ok(out.includes('escrever do seu jeito'));
});

t('título sem emoji ganha marcador', () => {
  const out = interactiveAsText('Escolha', { type: 'button', buttons: [{ id: 'a', title: 'Sim' }, { id: 'b', title: 'Não' }] });
  assert.ok(out.includes('▫️ *Sim*') && out.includes('▫️ *Não*'));
});

t('emoji com seletor de variação (U+FE0F) é preservado', () => {
  const out = interactiveAsText('x', list([{ id: 'u', title: '🚨️ Urgências' }]));
  assert.ok(out.includes('*Urgências*'));
});

t('horários de agenda (slot:) continuam numerados', () => {
  const out = interactiveAsText('Horários', list([{ id: 'slot:1', title: 'Seg 10h' }, { id: 'slot:2', title: 'Ter 14h' }]));
  assert.ok(out.includes('1) Seg 10h') && out.includes('2) Ter 14h'));
});

t('título vazio não quebra', () => {
  const out = interactiveAsText('x', list([{ id: 'v', title: '' }]));
  assert.ok(typeof out === 'string' && out.startsWith('x'));
});

console.log(`${ok} testes passaram`);
