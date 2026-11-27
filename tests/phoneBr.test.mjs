import test from 'node:test';
import assert from 'node:assert/strict';
import { waNumber } from '../supabase/functions/whatsapp-outbound-gate/deploy/source/_shared/phone-br.mjs';

test('cadastro sem 55 ganha o código do Brasil', () => {
  assert.equal(waNumber('(31)9830-0768'), '553198300768');
  assert.equal(waNumber('(31)99914-2202'), '5531999142202');
  assert.equal(waNumber('31 98112-5096'), '5531981125096');
  assert.equal(waNumber('55999998888'), '5555999998888'); // DDD 55 (RS)
});
test('não altera quem já está certo ou é de fora', () => {
  assert.equal(waNumber('5531999142202'), '5531999142202');
  assert.equal(waNumber('553198300768'), '553198300768');
  assert.equal(waNumber('+1 415 555 2671'), '14155552671');
  assert.equal(waNumber('+351912345678'), '351912345678');
  assert.equal(waNumber('14155552671'), '14155552671');
  assert.equal(waNumber('121006760976409@lid'), '121006760976409');
  for (const v of ['', null, undefined, '123']) assert.equal(waNumber(v), v === '123' ? '123' : '');
});
