// node --experimental-strip-types tests/itcdMg.test.mts
import {calcItcdMg, finePercentFor, itcdMemorial, UFEMG_2026} from '../src/lib/itcdMg.ts';
let ok = 0, bad = 0;
const t = (name: string, cond: boolean, got?: any) => { if (cond) { ok++; console.log('PASSOU', name); } else { bad++; console.log('FALHOU', name, JSON.stringify(got)); } };
const U = UFEMG_2026;

// causa mortis básica, paga no prazo de 90 dias -> 15% desconto
let r = calcItcdMg({kind:'causa_mortis', factDate:'2026-03-01', paymentDate:'2026-05-20', totalValue:1_000_000, ufemg:U});
t('CM1 base', r.base === 1_000_000, r); t('CM1 imposto 5%', r.taxGross === 50_000, r);
t('CM1 desconto 15%', r.discount === 7_500 && r.total === 42_500, r);
t('CM1 vencimento 180d', r.dueDate === '2026-08-28', r.dueDate);
// dia 90 exato ainda tem desconto; dia 91 não
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-03-01', paymentDate:'2026-05-30', totalValue:100000, ufemg:U});
t('CM2 90º dia com desconto', r.discountRate === 0.15, r);
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-03-01', paymentDate:'2026-05-31', totalValue:100000, ufemg:U});
t('CM3 91º dia sem desconto', r.discountRate === 0 && r.total === 5000, r);
// meação 50%
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-03-01', totalValue:800000, spouseSharePercent:50, heirs:2, ufemg:U});
t('CM4 meação excluída', r.base === 400000 && r.taxGross === 20000, r);
t('CM4 por herdeiro', r.perHeir === 8500, r);
// isenção imóvel único residencial
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-03-01', totalValue:200000, onlyResidentialProperty:true, ufemg:U});
t('CM5 isento imóvel residencial', r.exempt && r.total === 0, r);
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-03-01', totalValue:40000*U+1, onlyResidentialProperty:true, ufemg:U});
t('CM6 acima de 40.000 UFEMG não isenta', !r.exempt && r.taxGross > 0, r);
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-03-01', totalValue:40000*U, onlyResidentialProperty:true, ufemg:U});
t('CM7 exatamente 40.000 UFEMG isenta', r.exempt, r);
// atraso: multa por faixa
t('Multa 0 dias', finePercentFor(0) === 0); t('Multa 10 dias = 1,5%', Math.abs(finePercentFor(10)-1.5) < 1e-9);
t('Multa 30 dias = 4,5%', Math.abs(finePercentFor(30)-4.5) < 1e-9); t('Multa 31 dias = 9%', finePercentFor(31) === 9);
t('Multa 60 dias = 9%', finePercentFor(60) === 9); t('Multa 61 dias = 12%', finePercentFor(61) === 12);
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-01-01', paymentDate:'2026-08-10', totalValue:100000, selicPercent:2, ufemg:U});
t('CM8 atraso 41 dias: multa 9% + SELIC 2%', r.daysLate === 41 && r.fine === 450 && r.interest === 100 && r.total === 5550, r);
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-01-01', paymentDate:'2026-08-10', totalValue:100000, ufemg:U});
t('CM9 atraso sem SELIC avisa', r.warnings.some(w=>/SELIC/.test(w)), r.warnings);
// virada de ano
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-12-15', paymentDate:'2027-01-10', totalValue:100000, ufemg:U});
t('CM10 virada de ano, desconto', r.discountRate === 0.15 && r.dueDate === '2027-06-13', r);

// doação
r = calcItcdMg({kind:'doacao', factDate:'2026-04-10', totalValue:50000, ufemg:U});
t('D1 até 10.000 UFEMG isenta', r.exempt && r.total === 0, r);
r = calcItcdMg({kind:'doacao', factDate:'2026-04-10', totalValue:100000, ufemg:U});
t('D2 doação 100 mil: 5% e desconto 50%', r.taxGross === 5000 && r.total === 2500, r);
r = calcItcdMg({kind:'doacao', factDate:'2026-04-10', totalValue:40000, previousDonations3y:30000, ufemg:U});
t('D3 soma 3 anos tira isenção', !r.exempt && r.base === 70000, r);
r = calcItcdMg({kind:'doacao', factDate:'2026-04-10', totalValue:100000, previousDonations3y:100000, previousTaxPaid:2500, ufemg:U});
t('D4 abate imposto já pago', r.taxGross === 7500, r);
r = calcItcdMg({kind:'doacao', factDate:'2026-04-10', totalValue:90000*U+100, ufemg:U});
t('D5 acima de 90.000 UFEMG sem desconto', r.discountRate === 0, r);
r = calcItcdMg({kind:'doacao', factDate:'2026-04-10', paymentDate:'2026-04-30', instrument:'particular', totalValue:100000, ufemg:U});
t('D6 particular: vence em 15 dias, 5 dias de atraso', r.dueDate === '2026-04-25' && r.daysLate === 5, r);
r = calcItcdMg({kind:'doacao', factDate:'2026-04-10', totalValue:100000});
t('D7 UFEMG padrão + aviso', r.warnings.some(w=>/UFEMG/.test(w)), r.warnings);

// negativos
const throws = (f: () => any) => { try { f(); return false; } catch { return true; } };
t('N1 sem data', throws(()=>calcItcdMg({kind:'causa_mortis', factDate:'', totalValue:1})));
t('N2b 31/02 inexistente', throws(()=>calcItcdMg({kind:'causa_mortis', factDate:'2026-02-31', totalValue:1})));
t('N2 data inválida', throws(()=>calcItcdMg({kind:'causa_mortis', factDate:'2026-02-31x', totalValue:1})));
t('N3 valor zero', throws(()=>calcItcdMg({kind:'doacao', factDate:'2026-01-01', totalValue:0})));
t('N4 valor negativo', throws(()=>calcItcdMg({kind:'doacao', factDate:'2026-01-01', totalValue:-5})));
t('N5 valor texto', throws(()=>calcItcdMg({kind:'doacao', factDate:'2026-01-01', totalValue:'abc' as any})));
t('N6 pagamento antes do fato', throws(()=>calcItcdMg({kind:'doacao', factDate:'2026-05-01', paymentDate:'2026-04-01', totalValue:100})));
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-03-01', totalValue:1000, spouseSharePercent:150, ufemg:U});
t('N7 meação >100% limitada', r.base === 0, r);
r = calcItcdMg({kind:'causa_mortis', factDate:'2026-03-01', totalValue:1000, heirs:0, ufemg:U});
t('N8 0 herdeiros sem divisão', r.perHeir === null, r);
const memo = itcdMemorial({kind:'causa_mortis', factDate:'2026-03-01', totalValue:1000000, ufemg:U});
t('M1 memória tem total', /TOTAL A PAGAR: R\$\s?42\.500,00/.test(memo), memo);
console.log(`\n${ok} passaram, ${bad} falharam`); process.exit(bad);
