// Cálculo do ITCD de Minas Gerais (Lei 14.941/2003 e RITCD — Decreto 43.981/2005).
// Regras usadas (conferidas em 02/10/2026):
// - alíquota única de 5% (art. 10 da Lei);
// - causa mortis: vence em 180 dias da abertura da sucessão (art. 13, I); desconto de 15% se pago
//   em até 90 dias (RITCD art. 23); isenção do imóvel residencial de até 40.000 UFEMG quando é o
//   único imóvel (art. 3º, I, "a"), limitado a um monte de até 48.000 UFEMG (RITCD art. 6º);
// - doação: isenta até 10.000 UFEMG somando as doações ao mesmo donatário em 3 anos civis
//   (art. 3º, II, "a" e art. 11); desconto de 50% para doação de até 90.000 UFEMG paga antes de
//   ação fiscal (RITCD art. 23-A); vence antes da escritura pública ou em 15 dias do escrito
//   particular (art. 13);
// - multa de mora espontânea: 0,15% ao dia até o 30º dia, 9% do 31º ao 60º, 12% depois
//   (art. 22, I); juros pela SELIC acumulada informada pelo usuário.

export const UFEMG_2026 = 5.7899;
export const ITCD_RATE = 0.05;

export type ItcdInput = {
  kind: 'causa_mortis' | 'doacao';
  factDate: string;        // óbito ou doação (AAAA-MM-DD)
  paymentDate?: string;    // data prevista do pagamento (padrão: data do fato)
  totalValue: number;      // causa mortis: total dos bens; doação: valor desta doação
  spouseSharePercent?: number; // meação (não tributada) — causa mortis
  heirs?: number;          // herdeiros para mostrar a cota de cada um
  onlyResidentialProperty?: boolean; // causa mortis: único imóvel é residencial
  residentialPropertyValue?: number;
  previousDonations3y?: number;  // doações anteriores ao mesmo donatário nos 3 anos civis
  previousTaxPaid?: number;      // ITCD já pago nessas doações
  instrument?: 'publica' | 'particular';
  ufemg?: number;
  selicPercent?: number;   // SELIC acumulada do vencimento até o pagamento (%)
};

export type ItcdResult = {
  base: number; taxGross: number; discountRate: number; discount: number; taxAfterDiscount: number;
  exempt: boolean; exemptReason: string; dueDate: string; daysLate: number; finePercent: number;
  fine: number; interest: number; total: number; perHeir: number | null; warnings: string[];
};

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v: any) => (Number.isFinite(+v) ? +v : 0);

function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string) {
  return Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 86400000);
}
const validDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z').getTime())
  && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s; // recusa 31/02 etc.

export function finePercentFor(daysLate: number) {
  if (daysLate <= 0) return 0;
  if (daysLate <= 30) return 0.15 * daysLate;
  if (daysLate <= 60) return 9;
  return 12;
}

export function calcItcdMg(i: ItcdInput): ItcdResult {
  const warnings: string[] = [];
  if (!validDate(i.factDate)) throw new Error('Informe a data do óbito ou da doação.');
  const total = num(i.totalValue);
  if (total <= 0) throw new Error('Informe o valor dos bens (maior que zero).');
  const pay = validDate(i.paymentDate) ? i.paymentDate! : i.factDate;
  if (diffDays(i.factDate, pay) < 0) throw new Error('A data do pagamento não pode ser anterior à data do fato.');
  const ufemg = num(i.ufemg) > 0 ? num(i.ufemg) : UFEMG_2026;
  if (!(num(i.ufemg) > 0)) warnings.push(`UFEMG não informada: usado o valor de 2026 (R$ ${UFEMG_2026.toFixed(4).replace('.', ',')}).`);
  if (new Date(i.factDate + 'T12:00:00Z').getUTCFullYear() !== 2026 && !(num(i.ufemg) > 0))
    warnings.push('O fato não é de 2026: confira a UFEMG do ano do fato gerador.');

  let base = 0, exempt = false, exemptReason = '', discountRate = 0, dueDate = '', previousTax = 0;

  if (i.kind === 'causa_mortis') {
    const meacao = Math.min(100, Math.max(0, num(i.spouseSharePercent)));
    base = total * (1 - meacao / 100);
    dueDate = addDays(i.factDate, 180);
    const resid = num(i.residentialPropertyValue) || total;
    if (i.onlyResidentialProperty && resid <= 40000 * ufemg && total <= 48000 * ufemg) {
      exempt = true;
      exemptReason = 'Isento: único imóvel, residencial, de até 40.000 UFEMG, em monte de até 48.000 UFEMG (Lei 14.941/2003, art. 3º, I, "a").';
    }
    if (diffDays(i.factDate, pay) <= 90) discountRate = 0.15;
    if (meacao > 0) warnings.push('A meação não é herança: foi excluída da base de cálculo.');
  } else {
    const prev = Math.max(0, num(i.previousDonations3y));
    previousTax = Math.max(0, num(i.previousTaxPaid));
    base = total + prev;
    dueDate = i.instrument === 'particular' ? addDays(i.factDate, 15) : i.factDate;
    if (base <= 10000 * ufemg) {
      exempt = true;
      exemptReason = 'Isento: doações ao mesmo donatário em 3 anos civis até 10.000 UFEMG (Lei 14.941/2003, art. 3º, II, "a").';
    }
    if (total <= 90000 * ufemg) discountRate = 0.5;
    if (prev > 0) warnings.push('Doações anteriores somadas (3 anos civis) e ITCD já pago abatido (art. 11).');
    if (i.instrument !== 'particular') warnings.push('Escritura pública: o imposto deve ser pago antes da lavratura.');
  }

  const taxGross = exempt ? 0 : Math.max(0, base * ITCD_RATE - previousTax);
  const discount = taxGross * discountRate;
  const taxAfterDiscount = taxGross - discount;
  const daysLate = Math.max(0, diffDays(dueDate, pay));
  const finePercent = finePercentFor(daysLate);
  // fora do prazo não há desconto de pontualidade (causa mortis já exige 90 dias)
  const fine = taxAfterDiscount * finePercent / 100;
  const interest = daysLate > 0 ? taxAfterDiscount * Math.max(0, num(i.selicPercent)) / 100 : 0;
  if (daysLate > 0 && !(num(i.selicPercent) > 0)) warnings.push('Pagamento em atraso: informe a SELIC acumulada para calcular os juros.');
  const total2 = taxAfterDiscount + fine + interest;
  const heirs = Math.floor(num(i.heirs));
  return {
    base: r2(base), taxGross: r2(taxGross), discountRate, discount: r2(discount), taxAfterDiscount: r2(taxAfterDiscount),
    exempt, exemptReason, dueDate, daysLate, finePercent: r2(finePercent), fine: r2(fine), interest: r2(interest),
    total: r2(total2), perHeir: i.kind === 'causa_mortis' && heirs > 0 ? r2(total2 / heirs) : null, warnings,
  };
}

const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const br = (iso: string) => iso.split('-').reverse().join('/');

export function itcdMemorial(i: ItcdInput): string {
  const r = calcItcdMg(i);
  const lines = [
    `MEMÓRIA — ITCD MINAS GERAIS (${i.kind === 'causa_mortis' ? 'CAUSA MORTIS' : 'DOAÇÃO'})`,
    `Data do ${i.kind === 'causa_mortis' ? 'óbito' : 'ato da doação'}: ${br(i.factDate)}`,
    `Base de cálculo: ${money(r.base)}`,
    `Alíquota: 5%`,
    `Imposto bruto: ${money(r.taxGross)}`,
    `Desconto${r.discountRate ? ' (' + r.discountRate * 100 + '%)' : ''}: ${money(r.discount)}`,
    `Imposto após desconto: ${money(r.taxAfterDiscount)}`,
    `Vencimento: ${br(r.dueDate)}`,
    `Dias de atraso: ${r.daysLate}`,
    `Multa de mora (${r.finePercent.toLocaleString('pt-BR')}%): ${money(r.fine)}`,
    `Juros SELIC: ${money(r.interest)}`,
    `TOTAL A PAGAR: ${money(r.total)}`,
  ];
  if (r.perHeir !== null) lines.push(`Valor por herdeiro (divisão igual): ${money(r.perHeir)}`);
  if (r.exempt) lines.push('', r.exemptReason);
  if (r.warnings.length) lines.push('', ...r.warnings);
  lines.push('', 'Base legal: Lei 14.941/2003 e Decreto 43.981/2005 (RITCD/MG). Valor sujeito à avaliação/homologação da SEF/MG (art. 9º).');
  return lines.join('\n');
}
