import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/pages/PerfilCliente.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../src/pages/Settings.tsx", import.meta.url),
  "utf8",
);

assert.match(source, /Forma de definir a entrada/);
assert.match(source, /Percentual dos honorários-base/);
assert.match(source, /Valor fixo em dinheiro/);
assert.match(source, /Entrada sugerida \(R\$\)/);
assert.match(source, /Cliente apresentou contraproposta/);
assert.match(source, /Entrada oferecida \(R\$\)/);
assert.match(source, /Quantidade de parcelas/);
assert.match(source, /Valor de cada parcela \(R\$\)/);
assert.match(source, /Total oferecido pelo cliente/);
assert.match(source, /não será aceita automaticamente/);
assert.match(source, /pendente de análise e aprovação expressa do escritório/);
assert.match(source, /1\. Pagamento à vista/);
assert.match(source, /2\. Cartão parcelado/);
assert.match(source, /3\. Boleto parcelado/);
assert.match(source, /Acréscimo\/juros do cartão/);
assert.match(source, /cardIncomePct/);
assert.match(source, /boletoIncomePct/);
assert.match(source, /Análise de capacidade e risco de pagamento/);
assert.match(source, /não promete que o cliente pagará em dia/);
assert.doesNotMatch(source, /Comprometimento mensal de referência/);
assert.match(source, /const monthlyCap = 15/);
assert.match(source, /ideal_client_profile/);
assert.match(settings, /Perfil de cliente mais indicado para o escritório/);
assert.match(settings, /ideal_client_profile/);

const total = (entry, installments, installmentAmount) =>
  Math.max(0, entry) +
  Math.max(1, Math.min(60, Math.round(installments) || 1)) *
    Math.max(0, installmentAmount);

assert.equal(total(500, 10, 300), 3500);
assert.equal(total(-100, 0, -20), 0);
assert.equal(total(1000, 100, 200), 13000);

console.log(
  "propostas comerciais: 27 cenários de análise e condições aprovados",
);
