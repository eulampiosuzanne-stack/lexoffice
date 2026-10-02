import { useMemo,useState } from 'react';
import { AlertTriangle,Calculator,FileText,RefreshCw,Scale,ShieldCheck,TrendingUp } from 'lucide-react';

const money=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const areas:any={Familia:5000,Civel:5000,Consumidor:4000,Saude:6000,Bancario:5500,Trabalhista:5000,Previdenciario:4500,Empresarial:7000,Outro:5000};

export default function FeePricing(){
 const initial={nome:'',demanda:'',area:'Familia',fase:'Inicial',complexidade:3,urgencia:2,documentos:2,audiencias:1,processos:1,pericia:false,recurso:false,valorCausa:0,proveitoEconomico:0,pisoReferencia:0,horas:20,entrada:20,parcelas:10};
 const [f,setF]=useState(initial);
 const set=(k:string,v:any)=>setF(x=>({...x,[k]:v}));

 const calc=useMemo(()=>{
  const base=areas[f.area]||5000;
  const fator=1+(f.complexidade-1)*.16+(f.urgencia-1)*.09+(f.documentos-1)*.05+Math.max(0,f.audiencias-1)*.06+Math.max(0,f.processos-1)*.22+(f.pericia?.18:0)+(f.recurso?.22:0)+(f.fase==='Recursal'?.2:f.fase==='Execução'?.12:0);
  const horas=Math.max(0,f.horas)*180;
  const referenciaEconomica=Math.max(0,f.proveitoEconomico||f.valorCausa);
  const componenteEconomico=referenciaEconomica*.05;
  const tecnico=Math.max(base*fator,horas,componenteEconomico);
  const piso=Math.max(0,f.pisoReferencia);
  const percentualAlvo=Math.min(.45,.25+(f.complexidade-1)*.04+(f.urgencia-1)*.02);
  const limiteComercial=referenciaEconomica>0?referenciaEconomica*percentualAlvo:tecnico;
  const comercial=Math.max(piso,Math.min(tecnico,limiteComercial));
  const proporcao=referenciaEconomica>0?comercial/referenciaEconomica:0;
  const proporcaoTecnica=referenciaEconomica>0?tecnico/referenciaEconomica:0;
  const alerta=referenciaEconomica>0&&proporcaoTecnica>=.5;
  const pisoIncompativel=referenciaEconomica>0&&piso>limiteComercial;
  const entrada=comercial*(Math.min(100,Math.max(0,f.entrada))/100);
  const saldo=Math.max(0,comercial-entrada);
  return{tecnico,comercial,referenciaEconomica,percentualAlvo,proporcao,proporcaoTecnica,alerta,pisoIncompativel,entrada,parcela:saldo/Math.max(1,f.parcelas),score:Math.min(10,Math.max(1,Math.round(fator*4.2)))};
 },[f]);

 function reset(){setF(initial)}
 function proposal(){
  const txt=`PROPOSTA DE HONORÁRIOS ADVOCATÍCIOS\n\nSuzanne Figueiredo Advocacia e Soluções Jurídicas\n\nInteressado(a): ${f.nome||'A definir'}\nDemanda: ${f.demanda||f.area}\n\nHonorários propostos: ${money(calc.comercial)}\nEntrada: ${money(calc.entrada)}\nSaldo: ${f.parcelas} parcela(s) de ${money(calc.parcela)}.\n\nEscopo e eventuais fases posteriores devem ser definidos no contrato. O valor foi submetido à análise de esforço técnico e proporcionalidade econômica e permanece sujeito à validação da advogada responsável.`;
  const w=window.open('','_blank');
  if(w){w.document.write(`<pre style="white-space:pre-wrap;font:16px Georgia;max-width:800px;margin:50px auto;line-height:1.6">${txt.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>`);w.document.title='Proposta de Honorários';w.print()}
 }

 return <div className="module"><div className="page-title"><h1>Honorários & Propostas</h1><p>Precificação estratégica com esforço técnico, proveito econômico e proporcionalidade comercial.</p></div>
 <div className="system-bar"><span>⚖ INTELIGÊNCIA DE PRECIFICAÇÃO</span><span className="online">● SIMULAÇÃO INTERNA</span></div>
 <div className="integration-panel"><div className="integration-head"><div><span className="integration-pill"><Calculator size={14}/> NOVA PRECIFICAÇÃO</span><h2>Demanda, esforço e dimensão econômica</h2><p>A Lex calcula o custo técnico e depois testa a viabilidade econômica da proposta. A decisão final é da advogada.</p></div><button className="secondary" onClick={reset}><RefreshCw size={16}/> Limpar</button></div>
 <div className="advanced-grid">
 <label>Nome / lead<input value={f.nome} onChange={e=>set('nome',e.target.value)} placeholder="Opcional"/></label>
 <label>Área<select value={f.area} onChange={e=>set('area',e.target.value)}>{Object.keys(areas).map(x=><option key={x}>{x}</option>)}</select></label>
 <label className="wide">Demanda<input value={f.demanda} onChange={e=>set('demanda',e.target.value)} placeholder="Ex.: ação consumerista já ajuizada"/></label>
 <label>Fase<select value={f.fase} onChange={e=>set('fase',e.target.value)}><option>Inicial</option><option>Em andamento</option><option>Execução</option><option>Recursal</option></select></label>
 <label>Complexidade (1–5)<input type="number" min="1" max="5" value={f.complexidade} onChange={e=>set('complexidade',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Urgência (1–5)<input type="number" min="1" max="5" value={f.urgencia} onChange={e=>set('urgencia',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Volume documental (1–5)<input type="number" min="1" max="5" value={f.documentos} onChange={e=>set('documentos',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Audiências estimadas<input type="number" min="0" value={f.audiencias} onChange={e=>set('audiencias',Math.max(0,+e.target.value||0))}/></label>
 <label>Atuações/processos<input type="number" min="1" value={f.processos} onChange={e=>set('processos',Math.max(1,+e.target.value||1))}/></label>
 <label>Horas estimadas<input type="number" min="0" value={f.horas} onChange={e=>set('horas',Math.max(0,+e.target.value||0))}/></label>
 <label>Valor da causa (R$)<input type="number" min="0" value={f.valorCausa} onChange={e=>set('valorCausa',Math.max(0,+e.target.value||0))}/></label>
 <label>Proveito econômico estimado (R$)<input type="number" min="0" value={f.proveitoEconomico} onChange={e=>set('proveitoEconomico',Math.max(0,+e.target.value||0))} placeholder="Se conhecido"/></label>
 <label>Referência mínima aplicável (R$)<input type="number" min="0" value={f.pisoReferencia} onChange={e=>set('pisoReferencia',Math.max(0,+e.target.value||0))} placeholder="Tabela aplicável / validação humana"/></label>
 <label><span>Perícia</span><input type="checkbox" checked={f.pericia} onChange={e=>set('pericia',e.target.checked)}/></label>
 <label><span>Provável recurso</span><input type="checkbox" checked={f.recurso} onChange={e=>set('recurso',e.target.checked)}/></label>
 </div></div>

 <div className="dashboard-kpis" style={{marginTop:16}}>
 <div className="dashboard-kpi"><div className="dashboard-kpi-head"><Scale size={18}/></div><strong>{money(calc.tecnico)}</strong><span>Valor técnico do trabalho</span></div>
 <div className="dashboard-kpi"><div className="dashboard-kpi-head"><TrendingUp size={18}/></div><strong>{money(calc.comercial)}</strong><span>Valor comercial sugerido</span></div>
 <div className="dashboard-kpi"><div className="dashboard-kpi-head"><ShieldCheck size={18}/></div><strong>{calc.referenciaEconomica?Math.round(calc.proporcao*100)+'%':'—'}</strong><span>Honorários / referência econômica</span></div>
 <div className="dashboard-kpi"><strong>{calc.score}/10</strong><span>Índice de esforço Lex</span></div></div>

 {calc.alerta&&<div className="integration-notice" style={{marginTop:16}}><AlertTriangle size={16}/> <strong>Alerta de proporcionalidade:</strong> o valor técnico representa {Math.round(calc.proporcaoTecnica*100)}% da referência econômica. A Lex ajustou a sugestão comercial para {Math.round(calc.percentualAlvo*100)}%, sem tratar esse percentual como teto jurídico. Considere contratação por fase, fixo + êxito, redefinição de escopo ou revisão manual.</div>}
 {calc.pisoIncompativel&&<div className="integration-notice" style={{marginTop:12}}><AlertTriangle size={16}/> <strong>Revisão obrigatória:</strong> a referência mínima informada supera o ajuste comercial calculado. Não reduzir automaticamente. Validar tabela aplicável, escopo e modelo de contratação.</div>}

 <div className="integration-panel" style={{marginTop:16}}><div className="integration-head"><div><h2>Condição de pagamento</h2><p>Simulação calculada sobre o valor comercial sugerido, não sobre o custo técnico bruto.</p></div></div><div className="advanced-grid"><label>Entrada (%)<input type="number" min="0" max="100" value={f.entrada} onChange={e=>set('entrada',+e.target.value||0)}/></label><label>Parcelas do saldo<input type="number" min="1" max="60" value={f.parcelas} onChange={e=>set('parcelas',Math.min(60,Math.max(1,+e.target.value||1)))}/></label><label>Entrada sugerida<input disabled value={money(calc.entrada)}/></label><label>Valor da parcela<input disabled value={money(calc.parcela)}/></label></div><button className="primary" onClick={proposal}><FileText size={16}/> Gerar proposta</button></div>

 <div className="integration-notice" style={{marginTop:16}}>A referência econômica usa primeiro o proveito econômico estimado e, na ausência dele, o valor da causa. Percentuais são indicadores internos de proporcionalidade, não limites jurídicos. Antes da contratação, valide a tabela de honorários aplicável, o escopo, as fases incluídas e as particularidades do caso.</div>
 </div>
}