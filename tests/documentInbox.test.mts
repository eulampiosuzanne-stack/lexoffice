import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore módulo JS da edge function
import { buildList, readChoice, extension, confirmation, OTHER } from '../supabase/functions/whatsapp-media-intake/docinbox.mjs';

const reqs = [{ id: 'a1', title: 'Certidão do Detran | atualizada e muito comprida mesmo' }, { id: 'b2', title: 'Holerite' }];

test('lista tem os pedidos e "Outro documento", sem quebrar o formato', () => {
  const l = buildList(reqs);
  assert.deepEqual(l.options, ['docreq:a1', 'docreq:b2', OTHER]);
  assert.ok(l.rows.every(r => r.title.length <= 24 && !r.title.includes('|') && !r.description.includes('|')));
  assert.match(l.asText, /2\. Holerite\n3\. Outro documento/);
});
test('no máximo 10 linhas', () => {
  assert.equal(buildList(Array.from({ length: 15 }, (_, i) => ({ id: 'x' + i, title: 'Doc ' + i }))).rows.length, 10);
});
test('escolha por toque ou por número; inválida é null', () => {
  const { options } = buildList(reqs);
  assert.equal(readChoice('docreq:b2', 'Holerite', options), 'b2');
  assert.equal(readChoice('', ' 1 ', options), 'a1');
  assert.equal(readChoice('', '3', options), 'other');
  for (const bad of ['0', '4', 'oi', '']) assert.equal(readChoice('', bad, options), null);
});
test('extensão e confirmação', () => {
  assert.equal(extension('RG.PDF', ''), 'pdf');
  assert.equal(extension('', 'image/jpeg'), 'jpg');
  assert.match(confirmation('Holerite', ['RG']), /Ainda falta:\n• RG/);
  assert.match(confirmation('RG', []), /Não falta nenhum/);
});
