import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReceipt, looksLikeReceipt, phoneVariants } from '../supabase/functions/whatsapp-media-intake/receipt.mjs';

const now = Date.parse('2026-11-25T21:00:00-03:00');
const good = `Documento: Comprovante de pagamento via Pix.
- **VALOR:** R$ 300,00
- **DATA:** 25/11/2026 - 20:18:47
- **PAGADOR:** MARIA DE TESTE (CPF: ***.000.000-**)
- **RECEBEDOR:** Suzanne Eulampio da Silva Figueiredo (Banco Bradesco)`;
const run = (t: string) => checkReceipt(t, { fee: 300, now });

test('comprovante correto', () => {
  const r: any = run(good);
  assert.equal(r.ok, true);
  assert.equal(r.amount, 300);
  assert.equal((run(good) as any).reference, r.reference);
});
test('recebedor em linhas separadas', () => {
  assert.equal(run(good.replace(/- \*\*RECEBEDOR:.*$/, 'Destinatário:\n  - Nome: Suzanne Eulampio da Silva Figueiredo')).ok, true);
});
test('recusa o que não bate', () => {
  for (const t of [
    good.replace('300,00', '309,00'),
    good.replace('300,00', '30,00'),
    good.replace('Suzanne Eulampio da Silva Figueiredo', 'Fulano de Tal'),
    good.replace('MARIA DE TESTE', 'Suzanne Figueiredo').replace('Suzanne Eulampio da Silva Figueiredo', 'Fulano de Tal'),
    good.replace('Comprovante de pagamento via Pix', 'Comprovante de agendamento de Pix'),
    good + '\nStatus: pendente',
    good.replace('25/11/2026', '01/11/2026'),
    good.replace('25/11/2026', '29/11/2026'),
    good.replace(/- \*\*DATA.*\n/, ''),
    'Contrato de honorários no valor: R$ 300,00',
    '',
  ]) assert.equal(run(t).ok, false, t);
  assert.equal(looksLikeReceipt('Cartão CNPJ'), false);
});
test('formato real do leitor, com ID da transação', () => {
  const r: any = run(`**Tipo de documento:** Comprovante de Pix.

- **VALOR:** R$ 300,00
- **DATA:** 24/11/2026, às 13:25:45
- **PAGADOR:** Pessoa de Teste (CPF: ***.000.000-**)
- **RECEBEDOR:** Suzanne Eulampio da Silva Figueiredo (CPF: ***.000.000-**)
- **Situação:** Efetivado
- **ID da transação:** E00000000202611241625abcdef12345`);
  assert.equal(r.ok, true);
  assert.equal(r.reference, 'e00000000202611241625abcdef12345');
});
test('telefone com e sem o nono dígito', () => {
  assert.ok(phoneVariants('553188887777').includes('5531988887777'));
});
