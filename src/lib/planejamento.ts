/* Planejamento — régua previdenciária, tributária e patrimonial (parâmetros 2026).
   Lógica pura (sem React) portada da calculadora "Planejamento Suzanne Figueiredo". */
type Dict = Record<string, string>;

export const PARAMS_2026 = {
  salarioMinimo: 1621.0,
  tetoInss: 8475.55,
  irpf: [
    { ate: 2428.8, aliquota: 0, deducao: 0 },
    { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
    { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
    { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
    { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
  ],
  irpfReducaoAte5000: 312.89,
  irpfReducaoA: 978.62,
  irpfReducaoB: 0.133145,
  irpfReducaoLimite: 7350,
  descontoSimplificado: 607.2,
  dividendosLimiteMensal: 50000,
  dividendosAliquota: 0.1,
  altaRendaAnual: 600000,
  presumidoLimiteAnual: 5000000,
};

export const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(v) ? v : 0);
export const pct = (v: number, casas = 2) => `${(Number.isFinite(v) ? v * 100 : 0).toFixed(casas).replace('.', ',')}%`;
export const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string' || !v.trim()) return 0;
  const s = v.trim().replace(/\s|R\$/g, '');
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

export class PlanningInputError extends Error {}
const fail = (m: string): never => { throw new PlanningInputError(m); };

export function irpfMensal2026(rendimento: number, deducoesLegais = 0) {
  if (!(rendimento > 0)) return 0;
  const base = Math.max(0, rendimento - Math.max(deducoesLegais, PARAMS_2026.descontoSimplificado));
  const faixa = PARAMS_2026.irpf.find((f) => base <= f.ate)!;
  const imposto = Math.max(0, base * faixa.aliquota - faixa.deducao);
  let reducao = 0;
  if (rendimento <= 5000) reducao = Math.min(imposto, PARAMS_2026.irpfReducaoAte5000);
  else if (rendimento <= PARAMS_2026.irpfReducaoLimite) reducao = Math.max(0, PARAMS_2026.irpfReducaoA - PARAMS_2026.irpfReducaoB * rendimento);
  return r2(Math.max(0, imposto - reducao));
}

function parseDate(v: string, campo: string) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`Informe ${campo}.`);
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) fail(`${campo} inválida.`);
  return d;
}
const addMonths = (d: Date, m: number) => {
  const x = new Date(d.getTime()); const dia = x.getUTCDate();
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + m);
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(dia, ultimo)); return x;
};
const yearsBetween = (a: Date, b: Date) => {
  const anos = b.getUTCFullYear() - a.getUTCFullYear();
  let meses = b.getUTCMonth() - a.getUTCMonth();
  if (b.getUTCDate() < a.getUTCDate()) meses -= 1;
  return anos + meses / 12;
};
const br = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const anosMeses = (v: number) => { const total = Math.max(0, Math.round(v * 12)); const a = Math.floor(total / 12), m = total % 12; return `${a} ano(s)${m ? ` e ${m} mês(es)` : ''}`; };

function fatorPrevidenciario(tempo: number, idade: number, expectativa: number, sexo: string) {
  if (!(expectativa > 0)) return null;
  const tc = tempo + (sexo === 'female' ? 5 : 0); const a = 0.31;
  return (tc * a / expectativa) * (1 + (idade + tc * a) / 100);
}

type Regra = { nome: string; elegivel?: string; check: (i: number, t: number, dt: Date) => boolean; coef: (t: number, i: number) => number | null; obs?: string };

export function planejamentoPrevidenciario(d: Dict) {
  const sexo = d.sex === 'male' ? 'male' : d.sex === 'female' ? 'female' : fail('Informe o sexo para os parâmetros previdenciários.');
  const nasc = parseDate(d.birthDate, 'a data de nascimento');
  const ref = parseDate(d.referenceDate || new Date().toISOString().slice(0, 10), 'a data de referência');
  if (nasc >= ref) fail('A data de nascimento deve ser anterior à data de referência.');
  const idadeRef = yearsBetween(nasc, ref);
  if (idadeRef < 14) fail('Idade incompatível com contribuição ao INSS (mínimo 14 anos).');
  if (idadeRef > 100) fail('Confira a data de nascimento: idade acima de 100 anos.');
  const tempoAtual = num(d.contributionYears);
  if (tempoAtual < 0 || tempoAtual > 60) fail('Tempo de contribuição atual deve estar entre 0 e 60 anos.');
  if (tempoAtual > idadeRef - 12) fail('Tempo de contribuição maior do que a idade permite. Confira os dados.');
  const filiadoAntes = d.affiliatedBeforeReform !== 'nao';
  const tempoReforma = filiadoAntes ? num(d.contributionAtReform) : 0;
  if (tempoReforma < 0 || tempoReforma > tempoAtual) fail('O tempo em 13/11/2019 não pode ser negativo nem maior que o tempo atual.');
  let media = num(d.averageSalary);
  if (media < 0) fail('A média salarial não pode ser negativa.');
  const salarioContrib = Math.min(Math.max(num(d.futureContributionBase) || PARAMS_2026.salarioMinimo, PARAMS_2026.salarioMinimo), PARAMS_2026.tetoInss);
  const aliquota = num(d.contributionRate || '20') / 100;
  if (aliquota <= 0 || aliquota > 0.2) fail('A alíquota de contribuição deve estar entre 0,01% e 20%.');
  const continua = d.keepContributing !== 'nao';
  const expectativa = num(d.lifeExpectancy);
  const avisos: string[] = [];
  if (!media) { media = salarioContrib; avisos.push('Média salarial não informada: usada a base de contribuição futura como estimativa.'); }
  const mediaLimitada = Math.min(media, PARAMS_2026.tetoInss);
  if (media > PARAMS_2026.tetoInss) avisos.push('A média informada passa do teto; foi limitada ao teto do INSS.');
  if (aliquota === 0.11 || aliquota === 0.05) avisos.push('Alíquota de 11% ou 5% (plano simplificado/baixa renda) só garante aposentadoria por idade no valor de 1 salário mínimo; para as demais regras é preciso complementar até 20%.');
  const reqTempo = sexo === 'female' ? 30 : 35; const coefBase = sexo === 'female' ? 15 : 20;
  const coef = (tempo: number) => 0.6 + 0.02 * Math.max(0, Math.floor(tempo + 1e-9) - coefBase);
  const ano = (dt: Date) => dt.getUTCFullYear();
  const pontosExig = (y: number) => (sexo === 'female' ? Math.min(100, 86 + Math.max(0, y - 2019)) : Math.min(105, 96 + Math.max(0, y - 2019)));
  const idadeProgExig = (y: number) => (sexo === 'female' ? Math.min(62, 56 + 0.5 * Math.max(0, y - 2019)) : Math.min(65, 61 + 0.5 * Math.max(0, y - 2019)));
  const pedagio50Tempo = reqTempo + 0.5 * Math.max(0, reqTempo - tempoReforma);
  const pedagio100Tempo = reqTempo + Math.max(0, reqTempo - tempoReforma);
  const naoFiliado = 'Exige filiação ao INSS antes de 13/11/2019.';
  const regras: Regra[] = [
    { nome: 'Regra permanente (aposentadoria programada)', check: (i, t) => i >= (sexo === 'female' ? 62 : 65) && t >= (sexo === 'female' ? 15 : 20), coef: (t) => coef(t) },
    { nome: 'Transição por idade (art. 18 EC 103)', elegivel: filiadoAntes ? undefined : naoFiliado, check: (i, t) => i >= (sexo === 'female' ? 62 : 65) && t >= 15, coef: (t) => coef(t) },
    { nome: 'Transição por pontos (art. 15)', elegivel: filiadoAntes ? undefined : naoFiliado, check: (i, t, dt) => t >= reqTempo && i + t >= pontosExig(ano(dt)) - 1e-9, coef: (t) => coef(t) },
    { nome: 'Transição por idade mínima progressiva (art. 16)', elegivel: filiadoAntes ? undefined : naoFiliado, check: (i, t, dt) => t >= reqTempo && i >= idadeProgExig(ano(dt)) - 1e-9, coef: (t) => coef(t) },
    { nome: 'Transição pedágio 50% (art. 17)', elegivel: !filiadoAntes ? naoFiliado : tempoReforma <= reqTempo - 2 ? `Exige mais de ${reqTempo - 2} anos de contribuição em 13/11/2019.` : undefined, check: (_i, t) => t >= pedagio50Tempo - 1e-9, coef: (t, i) => fatorPrevidenciario(t, i, expectativa, sexo), obs: '100% da média multiplicado pelo fator previdenciário.' },
    { nome: 'Transição pedágio 100% (art. 20)', elegivel: filiadoAntes ? undefined : naoFiliado, check: (i, t) => i >= (sexo === 'female' ? 57 : 60) && t >= pedagio100Tempo - 1e-9, coef: () => 1, obs: '100% da média, sem fator previdenciário.' },
  ];
  const LIMITE_MESES = 12 * 50;
  const resultados = regras.map((r) => {
    if (r.elegivel) return { regra: r.nome, aplicavel: false, motivo: r.elegivel } as any;
    for (let m = 0; m <= LIMITE_MESES; m++) {
      const dt = addMonths(ref, m); const idade = yearsBetween(nasc, dt); if (idade > 100) break;
      const tempo = tempoAtual + (continua ? m / 12 : 0);
      if (r.check(idade, tempo, dt)) {
        const c = r.coef(tempo, idade);
        const beneficio = c == null ? undefined : r2(Math.min(PARAMS_2026.tetoInss, Math.max(PARAMS_2026.salarioMinimo, mediaLimitada * c)));
        const mesesContribuindo = continua ? m : 0;
        return { regra: r.nome, aplicavel: true, data: dt, idade, tempo, coeficiente: c ?? undefined, beneficio, mesesContribuindo, custo: r2(mesesContribuindo * salarioContrib * aliquota), observacao: c == null ? 'Informe a expectativa de sobrevida (tábua IBGE) para calcular o fator previdenciário.' : r.obs } as any;
      }
    }
    return { regra: r.nome, aplicavel: false, motivo: continua ? 'Requisitos não alcançados no horizonte de 50 anos.' : 'Sem novas contribuições, os requisitos de tempo não serão alcançados.' } as any;
  });
  const possiveis = resultados.filter((r: any) => r.aplicavel && r.data);
  const maisCedo = [...possiveis].sort((a: any, b: any) => a.data.getTime() - b.data.getTime())[0];
  const comValor = possiveis.filter((r: any) => r.beneficio != null);
  const maiorValor = [...comValor].sort((a: any, b: any) => b.beneficio - a.beneficio || a.data.getTime() - b.data.getTime())[0];
  const linhas = ['PLANEJAMENTO PREVIDENCIÁRIO — RGPS (EC 103/2019)', `Data de referência: ${br(ref)}`, `Idade na referência: ${anosMeses(idadeRef)}`, `Tempo de contribuição atual: ${anosMeses(tempoAtual)}`, `Filiado antes da reforma: ${filiadoAntes ? `Sim (tempo em 13/11/2019: ${anosMeses(tempoReforma)})` : 'Não'}`, `Média salarial considerada: ${money(mediaLimitada)}`, `Contribuição futura: ${continua ? `${money(salarioContrib)} × ${pct(aliquota)} = ${money(salarioContrib * aliquota)} por mês` : 'Não continuará contribuindo'}`, ''];
  for (const r of resultados) {
    if (!r.aplicavel) { linhas.push(`${r.regra}: não se aplica — ${r.motivo}`); continue; }
    linhas.push(`${r.regra} — data possível: ${br(r.data)} (idade ${anosMeses(r.idade)}; tempo ${anosMeses(r.tempo)})`);
    linhas.push(`${r.regra} — benefício estimado: ${r.beneficio != null ? `${money(r.beneficio)} (coeficiente ${pct(r.coeficiente)})` : 'depende do fator previdenciário'}`);
    linhas.push(`${r.regra} — custo das contribuições até lá: ${money(r.custo)}`);
    if (r.observacao) linhas.push(`${r.regra} — observação: ${r.observacao}`);
  }
  linhas.push('');
  if (maisCedo) linhas.push(`Regra mais rápida: ${maisCedo.regra} em ${br(maisCedo.data)}`); else linhas.push('Regra mais rápida: nenhuma regra alcançada com os dados informados');
  if (maiorValor) {
    linhas.push(`Maior benefício estimado: ${maiorValor.regra} — ${money(maiorValor.beneficio)}`);
    if (maiorValor.custo && maiorValor.beneficio) linhas.push(`Retorno do investimento: ${Math.ceil(maiorValor.custo / maiorValor.beneficio)} mês(es) de benefício para recuperar o custo das contribuições`);
  }
  linhas.push(`TOTAL ESTIMADO DO MELHOR BENEFÍCIO: ${maiorValor ? money(maiorValor.beneficio) : 'não apurado'}`);
  linhas.push('');
  linhas.push(...avisos.map((a) => `Atenção: ${a}`));
  linhas.push('Observação: datas com precisão mensal e valores em moeda de 2026, sem reajustes futuros.');
  linhas.push('Conferir antes de usar: CNIS, carência (180 meses), qualidade de segurado, tempo especial/rural e direito adquirido até 13/11/2019.');
  return { texto: linhas.join('\n'), resultados, maisCedo, maiorValor };
}

type Faixa = { ate: number; aliq: number; ded: number };
const SIMPLES: Record<string, Faixa[]> = {
  III: [{ ate: 180000, aliq: 0.06, ded: 0 }, { ate: 360000, aliq: 0.112, ded: 9360 }, { ate: 720000, aliq: 0.135, ded: 17640 }, { ate: 1800000, aliq: 0.16, ded: 35640 }, { ate: 3600000, aliq: 0.21, ded: 125640 }, { ate: 4800000, aliq: 0.33, ded: 648000 }],
  IV: [{ ate: 180000, aliq: 0.045, ded: 0 }, { ate: 360000, aliq: 0.09, ded: 8100 }, { ate: 720000, aliq: 0.102, ded: 12420 }, { ate: 1800000, aliq: 0.14, ded: 39780 }, { ate: 3600000, aliq: 0.22, ded: 183780 }, { ate: 4800000, aliq: 0.33, ded: 828000 }],
  V: [{ ate: 180000, aliq: 0.155, ded: 0 }, { ate: 360000, aliq: 0.18, ded: 4500 }, { ate: 720000, aliq: 0.195, ded: 9900 }, { ate: 1800000, aliq: 0.205, ded: 17100 }, { ate: 3600000, aliq: 0.23, ded: 62100 }, { ate: 4800000, aliq: 0.305, ded: 540000 }],
};
function aliquotaEfetivaSimples(anexo: string, rbt12: number) {
  if (rbt12 <= 0) return SIMPLES[anexo][0].aliq;
  const f = SIMPLES[anexo].find((x) => rbt12 <= x.ate);
  if (!f) return null;
  return (rbt12 * f.aliq - f.ded) / rbt12;
}
function presumidoServicosMensal(receita: number, issAliquota: number, receitaAnual = receita * 12) {
  const limiteMensal = PARAMS_2026.presumidoLimiteAnual / 12;
  const excedente = receitaAnual > PARAMS_2026.presumidoLimiteAnual ? Math.max(0, receita - limiteMensal) : 0;
  const base = (receita - excedente) * 0.32 + excedente * 0.352;
  const irpj = base * 0.15 + Math.max(0, base - 20000) * 0.1;
  const csll = base * 0.09; const pis = receita * 0.0065; const cofins = receita * 0.03; const iss = receita * issAliquota;
  return { base, irpj, csll, pis, cofins, iss, total: irpj + csll + pis + cofins + iss, excedente };
}
function inssContribuinte(valor: number, aliquota: number) {
  if (valor <= 0) return 0;
  return Math.min(Math.max(valor, PARAMS_2026.salarioMinimo), PARAMS_2026.tetoInss) * aliquota;
}
function dividendosIR(v: number) { return v > PARAMS_2026.dividendosLimiteMensal ? r2(v * PARAMS_2026.dividendosAliquota) : 0; }

export function planejamentoTributario(d: Dict) {
  const receita = num(d.monthlyRevenue);
  if (receita <= 0) fail('Informe o faturamento mensal (maior que zero).');
  if (receita > 10000000) fail('Faturamento mensal acima de R$ 10 milhões: use análise contábil específica.');
  const despesas = num(d.monthlyExpenses);
  if (despesas < 0) fail('As despesas não podem ser negativas.');
  if (despesas > receita) fail('As despesas não podem ser maiores que o faturamento.');
  const proLaboreInf = num(d.proLabore);
  if (proLaboreInf < 0) fail('O pró-labore não pode ser negativo.');
  const proLabore = proLaboreInf > 0 ? Math.max(proLaboreInf, PARAMS_2026.salarioMinimo) : PARAMS_2026.salarioMinimo;
  if (proLabore > receita - despesas) fail('O pró-labore não pode ser maior que o lucro (faturamento menos despesas).');
  const iss = num(d.issRate === '' || d.issRate == null ? '5' : d.issRate) / 100;
  if (iss < 0 || iss > 0.05) fail('A alíquota de ISS deve estar entre 0% e 5%.');
  const rbt12Inf = num(d.annualRevenue); const rbt12 = rbt12Inf > 0 ? rbt12Inf : receita * 12;
  const atividade = String(d.activity || 'advocacia');
  const socios = Math.max(1, Math.floor(num(d.partners) || 1));
  const avisos: string[] = [];
  const inssPF = inssContribuinte(receita, 0.2);
  const irPF = irpfMensal2026(receita - despesas, inssPF);
  const totalPF = inssPF + irPF + receita * (d.pfIss === 'sim' ? iss : 0);
  const plPorSocio = proLabore / socios; const inssPLsocio = inssContribuinte(plPorSocio, 0.11); const irPLsocio = irpfMensal2026(plPorSocio, inssPLsocio);
  const encargoPL = (inssPLsocio + irPLsocio) * socios; const cpp = proLabore * 0.2;
  let anexo = atividade === 'advocacia' ? 'IV' : 'III'; const fatorR = (proLabore * 12) / rbt12;
  if (atividade === 'fator_r') anexo = fatorR >= 0.28 ? 'III' : 'V';
  const efetiva = aliquotaEfetivaSimples(anexo, rbt12);
  let totalSimples: number | null = null; let dividSimples = 0;
  if (efetiva == null) avisos.push('Receita anual acima de R$ 4,8 milhões: a empresa não pode optar pelo Simples Nacional.');
  else {
    const das = receita * efetiva; const cppSimples = anexo === 'IV' ? cpp : 0;
    const lucro = receita - despesas - das - cppSimples - proLabore; dividSimples = Math.max(0, lucro);
    const irDiv = dividendosIR(dividSimples / socios) * socios; totalSimples = das + cppSimples + encargoPL + irDiv;
    if (rbt12 > 3600000) avisos.push('Acima de R$ 3,6 milhões/ano, o ISS deixa de ser recolhido dentro do DAS (sublimite) — conferir com a contabilidade.');
  }
  const pres = presumidoServicosMensal(receita, iss, rbt12);
  const lucroPres = receita - despesas - pres.total - cpp - proLabore; const dividPres = Math.max(0, lucroPres);
  const irDivPres = dividendosIR(dividPres / socios) * socios; const totalPres = pres.total + cpp + encargoPL + irDivPres;
  if (pres.excedente > 0) avisos.push('Receita acima de R$ 5 milhões/ano: aplicada a presunção majorada em 10% (LC 224/2025) sobre o excedente — há discussões judiciais sobre essa majoração.');
  const regimes = [{ nome: 'Pessoa física (carnê-leão + INSS 20%)', total: totalPF }, ...(totalSimples != null ? [{ nome: `Simples Nacional — Anexo ${anexo}`, total: totalSimples }] : []), { nome: 'Lucro presumido', total: totalPres }].sort((a, b) => a.total - b.total);
  const melhor = regimes[0]; const pior = regimes[regimes.length - 1];
  if ((receita - despesas) * 12 > PARAMS_2026.altaRendaAnual) avisos.push('Renda anual acima de R$ 600 mil: pode haver imposto mínimo anual (IRPFM, Lei 15.270/2025) na declaração, não incluído aqui.');
  if (atividade === 'advocacia') avisos.push('Advocacia no Simples fica no Anexo IV (INSS patronal de 20% sobre o pró-labore pago à parte). Sociedade uniprofissional pode ter ISS fixo no município.');
  if (atividade === 'fator_r') avisos.push(`Fator R de ${pct(fatorR)}, enquadramento no ${fatorR >= 0.28 ? 'Anexo III' : 'Anexo V'}.`);
  const linhas = ['PLANEJAMENTO TRIBUTÁRIO — COMPARATIVO MENSAL (2026)', `Faturamento mensal: ${money(receita)}`, `Receita bruta 12 meses: ${money(rbt12)}`, `Despesas dedutíveis/operacionais: ${money(despesas)}`, `Pró-labore total: ${money(proLabore)} (${socios} sócio(s))`, '', `PF — INSS contribuinte individual: ${money(inssPF)}`, `PF — IRPF carnê-leão: ${money(irPF)}`, `PF — Carga total: ${money(totalPF)} (${pct(totalPF / receita)} do faturamento)`, ''];
  if (totalSimples != null && efetiva != null) linhas.push(`Simples — Alíquota efetiva Anexo ${anexo}: ${pct(efetiva)}`, `Simples — DAS: ${money(receita * efetiva)}`, ...(anexo === 'IV' ? [`Simples — INSS patronal (20% pró-labore): ${money(cpp)}`] : []), `Simples — INSS e IRPF do pró-labore: ${money(encargoPL)}`, `Simples — Lucro distribuível: ${money(dividSimples)}`, `Simples — Carga total: ${money(totalSimples)} (${pct(totalSimples / receita)} do faturamento)`, '');
  linhas.push(`Presumido — IRPJ: ${money(pres.irpj)}`, `Presumido — CSLL: ${money(pres.csll)}`, `Presumido — PIS/COFINS: ${money(pres.pis + pres.cofins)}`, `Presumido — ISS: ${money(pres.iss)}`, `Presumido — INSS patronal (20% pró-labore): ${money(cpp)}`, `Presumido — INSS e IRPF do pró-labore: ${money(encargoPL)}`, `Presumido — Lucro distribuível: ${money(dividPres)}`, ...(irDivPres > 0 ? [`Presumido — IRRF sobre dividendos (10%): ${money(irDivPres)}`] : []), `Presumido — Carga total: ${money(totalPres)} (${pct(totalPres / receita)} do faturamento)`, '', `Regime mais econômico: ${melhor.nome}`, `Economia mensal frente ao regime mais caro: ${money(pior.total - melhor.total)}`, `TOTAL ECONOMIA ANUAL ESTIMADA: ${money((pior.total - melhor.total) * 12)}`, '', ...avisos.map((a) => `Atenção: ${a}`), 'Observação: não considera créditos, retenções, ISS fixo, regimes especiais nem a reforma tributária (CBS/IBS a partir de 2027).', 'Recomendação: validar com a contabilidade antes de mudar de regime.');
  return { texto: linhas.join('\n'), regimes, melhor };
}

export function planejamentoPatrimonial(d: Dict) {
  const patrimonio = num(d.totalAssets);
  if (patrimonio <= 0) fail('Informe o valor total do patrimônio (maior que zero).');
  const imoveis = num(d.realEstateValue);
  if (imoveis < 0 || imoveis > patrimonio) fail('O valor dos imóveis deve estar entre zero e o patrimônio total.');
  const aluguel = num(d.monthlyRent);
  if (aluguel < 0) fail('A renda de aluguel não pode ser negativa.');
  const herdeiros = Math.floor(num(d.heirs));
  if (herdeiros < 1 || herdeiros > 50) fail('Informe o número de herdeiros (de 1 a 50).');
  const anos = Math.floor(num(d.horizonYears) || 10);
  if (anos < 1 || anos > 50) fail('O horizonte de comparação deve ser de 1 a 50 anos.');
  const p = (v: string, padrao: number, campo: string, max = 20) => { const x = v === '' || v == null ? padrao : num(v); if (x < 0 || x > max) fail(`${campo} deve estar entre 0% e ${max}%.`); return x / 100; };
  const itcmd = p(d.itcmdRate, 5, 'A alíquota de ITCMD', 8); const honor = p(d.inventoryFeeRate, 6, 'O percentual de honorários do inventário'); const custas = p(d.inventoryCostsRate, 2, 'O percentual de custas e emolumentos'); const itbi = p(d.itbiRate, 3, 'A alíquota de ITBI', 10);
  const baseQuotas = d.quotaBase === 'contabil' ? 'contabil' : 'mercado'; const valorContabil = num(d.bookValue);
  if (baseQuotas === 'contabil' && valorContabil <= 0) fail('Informe o valor declarado (contábil) dos bens para usar essa base no ITCMD.');
  const constituicao = num(d.holdingSetupCost); const anual = num(d.holdingAnnualCost);
  if (constituicao < 0 || anual < 0) fail('Custos da holding não podem ser negativos.');
  const imunidadeItbi = d.itbiImmunity === 'sim'; const avisos: string[] = [];
  const itcmdInv = patrimonio * itcmd; const honorInv = patrimonio * honor; const custasInv = patrimonio * custas; const totalInv = itcmdInv + honorInv + custasInv;
  const irAluguelPF = irpfMensal2026(aluguel) * 12 * anos;
  const baseDoacao = baseQuotas === 'contabil' ? Math.min(valorContabil, patrimonio) : patrimonio; const itcmdDoacao = baseDoacao * itcmd;
  const itbiIntegr = imunidadeItbi ? 0 : imoveis * itbi;
  const aluguelPJ = presumidoServicosMensal(aluguel, 0, aluguel * 12); const distribuicao = Math.max(0, aluguel - aluguelPJ.total);
  const irDiv = dividendosIR(distribuicao / herdeiros) * herdeiros; const tribAluguelPJ = (aluguelPJ.total + irDiv) * 12 * anos;
  const totalHolding = constituicao + itbiIntegr + itcmdDoacao + anual * anos + tribAluguelPJ; const totalSem = totalInv + irAluguelPF; const economia = totalSem - totalHolding;
  if (!imunidadeItbi && imoveis > 0) avisos.push('ITBI cobrado na integralização: holdings com atividade preponderante de compra, venda ou locação de imóveis em regra não têm a imunidade (STF, Tema 796).');
  if (baseQuotas === 'contabil') avisos.push('ITCMD calculado sobre o valor contábil das quotas: o Fisco estadual pode exigir o valor de mercado dos bens, gerando diferença a pagar.');
  avisos.push('Em MG o ITCD vigente é de 5%; o PL 2881/2024 (alíquotas progressivas) ainda tramita na ALMG — rever se for aprovado.');
  if (aluguel > 0) avisos.push('A partir de 2027 a locação por pessoa jurídica passa a ter CBS/IBS (reforma tributária), ainda não incluídos aqui.');
  const linhas = ['PLANEJAMENTO PATRIMONIAL E SUCESSÓRIO — COMPARATIVO', `Patrimônio total: ${money(patrimonio)}`, `Imóveis: ${money(imoveis)}`, `Aluguel mensal: ${money(aluguel)}`, `Herdeiros: ${herdeiros}`, `Horizonte: ${anos} ano(s)`, '', `Sem planejamento — ITCMD causa mortis (${pct(itcmd)}): ${money(itcmdInv)}`, `Sem planejamento — Honorários do inventário (${pct(honor)}): ${money(honorInv)}`, `Sem planejamento — Custas e emolumentos (${pct(custas)}): ${money(custasInv)}`, `Sem planejamento — IRPF sobre aluguéis no período: ${money(irAluguelPF)}`, `Sem planejamento — Custo total: ${money(totalSem)}`, '', `Holding — Constituição: ${money(constituicao)}`, `Holding — ITBI na integralização: ${money(itbiIntegr)}`, `Holding — ITCMD na doação das quotas (base ${baseQuotas === 'contabil' ? 'contábil' : 'de mercado'}): ${money(itcmdDoacao)}`, `Holding — Manutenção (contabilidade) no período: ${money(anual * anos)}`, `Holding — Tributos sobre aluguéis no período: ${money(tribAluguelPJ)}`, `Holding — Custo total: ${money(totalHolding)}`, '', `Quinhão estimado por herdeiro (após custos do inventário): ${money((patrimonio - totalInv) / herdeiros)}`, `Cenário mais econômico: ${economia > 0 ? 'Holding patrimonial' : 'Sem holding (inventário)'}`, `TOTAL ECONOMIA ESTIMADA NO PERÍODO: ${money(Math.abs(economia))}`, '', ...avisos.map((a) => `Atenção: ${a}`), 'Observação: valores de hoje, sem correção; não considera ganho de capital, usufruto, dívidas do espólio nem o tempo do inventário.'];
  return { texto: linhas.join('\n'), totalSem, totalHolding, economia };
}

export type CalcKey = 'prev' | 'trib' | 'pat';
export type Field = { key: string; label: string; type: 'number' | 'date' | 'select'; options?: [string, string][] };
export const CALCS: Record<CalcKey, { nome: string; aba: string; fn: (d: Dict) => { texto: string }; fields: Field[]; example: Dict; resumo: [string, RegExp][] }> = {
  prev: {
    nome: 'Planejamento Previdenciário', aba: 'Previdenciário', fn: planejamentoPrevidenciario,
    resumo: [['Regra mais rápida', /^Regra mais rápida/], ['Maior benefício', /^Maior benefício/], ['Retorno do investimento', /^Retorno/]],
    fields: [
      { key: 'sex', label: 'Sexo para parâmetros previdenciários', type: 'select', options: [['female', 'Feminino'], ['male', 'Masculino']] },
      { key: 'birthDate', label: 'Data de nascimento', type: 'date' },
      { key: 'referenceDate', label: 'Data de referência (em branco = hoje)', type: 'date' },
      { key: 'contributionYears', label: 'Tempo de contribuição até hoje (anos)', type: 'number' },
      { key: 'affiliatedBeforeReform', label: 'Contribuía ao INSS antes de 13/11/2019?', type: 'select', options: [['sim', 'Sim'], ['nao', 'Não']] },
      { key: 'contributionAtReform', label: 'Tempo de contribuição em 13/11/2019 (anos)', type: 'number' },
      { key: 'averageSalary', label: 'Média salarial atual (CNIS), R$', type: 'number' },
      { key: 'keepContributing', label: 'Vai continuar contribuindo?', type: 'select', options: [['sim', 'Sim'], ['nao', 'Não']] },
      { key: 'futureContributionBase', label: 'Salário de contribuição futuro, R$', type: 'number' },
      { key: 'contributionRate', label: 'Alíquota da contribuição (%)', type: 'number' },
      { key: 'lifeExpectancy', label: 'Expectativa de sobrevida IBGE (anos) — só pedágio 50%', type: 'number' },
    ],
    example: { sex: 'female', birthDate: '1970-05-10', referenceDate: '', contributionYears: '28', affiliatedBeforeReform: 'sim', contributionAtReform: '21', averageSalary: '4000', keepContributing: 'sim', futureContributionBase: '5000', contributionRate: '20', lifeExpectancy: '' },
  },
  trib: {
    nome: 'Planejamento Tributário', aba: 'Tributário', fn: planejamentoTributario,
    resumo: [['Regime mais econômico', /^Regime mais econômico/], ['Economia por ano', /^TOTAL ECONOMIA/]],
    fields: [
      { key: 'activity', label: 'Atividade', type: 'select', options: [['advocacia', 'Advocacia (Simples Anexo IV)'], ['servicos', 'Serviços do Anexo III'], ['fator_r', 'Serviços com Fator R (Anexo III ou V)']] },
      { key: 'monthlyRevenue', label: 'Faturamento mensal, R$', type: 'number' },
      { key: 'annualRevenue', label: 'Faturamento dos últimos 12 meses (em branco = mensal × 12)', type: 'number' },
      { key: 'monthlyExpenses', label: 'Despesas mensais do escritório, R$', type: 'number' },
      { key: 'proLabore', label: 'Pró-labore mensal total (em branco = 1 salário mínimo)', type: 'number' },
      { key: 'partners', label: 'Número de sócios', type: 'number' },
      { key: 'issRate', label: 'Alíquota de ISS (%)', type: 'number' },
      { key: 'pfIss', label: 'Como pessoa física recolhe ISS sobre o faturamento?', type: 'select', options: [['nao', 'Não (ISS fixo de autônomo)'], ['sim', 'Sim']] },
    ],
    example: { activity: 'advocacia', monthlyRevenue: '30000', annualRevenue: '360000', monthlyExpenses: '5000', proLabore: '3000', partners: '1', issRate: '5', pfIss: 'nao' },
  },
  pat: {
    nome: 'Planejamento Patrimonial e Sucessório', aba: 'Patrimonial', fn: planejamentoPatrimonial,
    resumo: [['Cenário mais econômico', /^Cenário mais econômico/], ['Economia no período', /^TOTAL ECONOMIA/]],
    fields: [
      { key: 'totalAssets', label: 'Valor total do patrimônio, R$', type: 'number' },
      { key: 'realEstateValue', label: 'Valor dos imóveis, R$', type: 'number' },
      { key: 'monthlyRent', label: 'Renda mensal de aluguéis, R$', type: 'number' },
      { key: 'heirs', label: 'Número de herdeiros', type: 'number' },
      { key: 'horizonYears', label: 'Horizonte de comparação (anos)', type: 'number' },
      { key: 'itcmdRate', label: 'Alíquota do ITCMD (%) — MG 5', type: 'number' },
      { key: 'inventoryFeeRate', label: 'Honorários do inventário (%)', type: 'number' },
      { key: 'inventoryCostsRate', label: 'Custas e emolumentos (%)', type: 'number' },
      { key: 'itbiRate', label: 'Alíquota do ITBI (%)', type: 'number' },
      { key: 'itbiImmunity', label: 'Imunidade de ITBI na integralização?', type: 'select', options: [['nao', 'Não (holding de locação)'], ['sim', 'Sim']] },
      { key: 'quotaBase', label: 'Base do ITCMD na doação das quotas', type: 'select', options: [['mercado', 'Valor de mercado'], ['contabil', 'Valor declarado (contábil)']] },
      { key: 'bookValue', label: 'Valor declarado dos bens, R$', type: 'number' },
      { key: 'holdingSetupCost', label: 'Custo de constituição da holding, R$', type: 'number' },
      { key: 'holdingAnnualCost', label: 'Custo anual de contabilidade da holding, R$', type: 'number' },
    ],
    example: { totalAssets: '2000000', realEstateValue: '1500000', monthlyRent: '10000', heirs: '2', horizonYears: '10', itcmdRate: '5', inventoryFeeRate: '6', inventoryCostsRate: '2', itbiRate: '3', itbiImmunity: 'nao', quotaBase: 'mercado', bookValue: '', holdingSetupCost: '15000', holdingAnnualCost: '6000' },
  },
};

export type Linha = { sep?: true; label?: string; value?: string };
const isNote = (l: string) => /^(Atenção|Observação|Conferir antes de usar|Recomendação)\b/.test(l);
/** Converte o texto da memória de cálculo em linhas de tabela, notas e resumo. */
export function calcular(key: CalcKey, d: Dict): { ok: true; rows: Linha[]; notes: string[]; resumo: [string, string][]; texto: string } | { ok: false; erro: string } {
  let texto: string;
  try { texto = CALCS[key].fn(d).texto; } catch (e: any) {
    return { ok: false, erro: e instanceof PlanningInputError ? e.message : 'Não foi possível calcular. Confira os dados.' };
  }
  const rows: Linha[] = []; const notes: string[] = [];
  for (const raw of texto.split('\n').slice(1)) {
    const l = raw.trim();
    if (!l) { rows.push({ sep: true }); continue; }
    if (isNote(l)) { notes.push(l); continue; }
    const i = l.indexOf(':'); if (i < 0) continue;
    rows.push({ label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() });
  }
  const resumo = CALCS[key].resumo
    .map(([t, re]) => [t, rows.find((r) => r.label && re.test(r.label))?.value] as [string, string | undefined])
    .filter((x): x is [string, string] => !!x[1]);
  return { ok: true, rows, notes, resumo, texto };
}
