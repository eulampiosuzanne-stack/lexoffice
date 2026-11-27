import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidCpf, localPhone, samePhone, signerError } from '../src/lib/signer.ts';

test('CPF', () => {
  assert.ok(isValidCpf('529.982.247-25'));
  for (const bad of ['', '123', '111.111.111-11', '529.982.247-24', '5299822472500']) assert.equal(isValidCpf(bad), false, bad);
});
test('telefone', () => {
  assert.equal(localPhone('+55 (11) 91234-5678'), '11912345678');
  assert.equal(localPhone('(55) 91234-5678'), '55912345678'); // DDD 55 não é cortado
  assert.equal(localPhone('91234-5678'), '');
  assert.ok(samePhone('11912345678', '+55 11 1234-5678'));
  assert.equal(samePhone('11912345678', '21912345678'), false);
  assert.equal(samePhone('', ''), false);
});
test('formulário', () => {
  assert.match(signerError('Maria', '52998224725', '11912345678'), /nome completo/);
  assert.match(signerError('   ', '52998224725', '11912345678'), /nome completo/);
  assert.match(signerError('Pessoa Exemplo', '1', '11912345678'), /CPF/);
  assert.match(signerError('Pessoa Exemplo', '52998224725', '123'), /WhatsApp/);
  assert.equal(signerError('Pessoa Exemplo', '52998224725', '11912345678'), '');
});
