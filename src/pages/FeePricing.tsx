import { useMemo,useState } from 'react';
import { Calculator,FileText,RefreshCw,Scale,ShieldCheck,TrendingUp } from 'lucide-react';

const money=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const areas:any={Familia:5000,Civel:5000,Consumidor:4000,Saude:6000,Bancario:5500,Trabalhista:5000,Previdenciario:4500,Empresarial:7000,Outro:5000};
export default function FeePricing(){
 const [f,setF]=useState({nome:'',demanda:'',area:'Familia',fase:'Inicial',complexidade:3,urgencia:2,documentos:2,audiencias:1,processos:1,pericia:false,recurso:false,valorEconomico:0,horas:20,entrada:20,parcelas:10});
 const set=(k:string,v:any)=>setF(x=>({...x,[k]:v}));
 const calc=useMemo(()=>{const base=areas[f.area]||5000;const fator=1+(f.complexidade-1)*.16+(f.urgencia-1)*.09+(f.documentos-1)*.05+Math.max(0,f.audiencias-1)*.06+Math.max(0,f.processos-1)*.22+(f.pericia?.18:0)+(f.recurso?.22:0)+(f.fase==='Recursal'?.2:f.fase==='Execução'?.12:0);const horas=Math.max(0,f.horas)*180;const economico=Math.max(0,f.valorEconomico)*.05;const ideal=Math.max(base*fator,horas,economico);const minimo=Math.max(base,ideal*.78);const premium=ideal*1.28;const entrada=ideal*(Math.min(100,Math.max(0,f.entrada))/100);const saldo=Math.max(0,ideal-entrada);return{minimo,ideal,premium,entrada,parcela:saldo/Math.max(1,f.parcelas),score:Math.min(10,Math.max(1,Math.round(fator*4.2)))}} ,[f]);
 function reset(){setF({nome:'',demanda:'',area:'Familia',fase:'Inicial',complexidade:3,urgencia:2,documentos:2,audiencias:1,processos:1,pericia:false,recurso:false,valorEconomico:0,horas:20,entrada:20,parcelas:10})}
 function proposal(){const txt=`PROPOSTA DE HONORÁRIOS ADVOCATÍCIOS\n\nSuzanne Figueiredo Advocacia e Soluções Jurídicas\n\nInteressado(a): ${f.nome||'A definir'}\nDemanda: ${f.demanda||f.area}\n\nHonorários propostos: ${money(calc.ideal)}\nEntrada: ${money(calc.entrada)}\nSaldo: ${f.parcelas} parcela(s) de ${money(calc.parcela)}.\n\nA proposta considera a natureza, complexidade, responsabilidade profissional e trabalho estimado para a demanda. O valor final permanece sujeito à validação da advogada responsável antes da contratação.`;const w=window.open('','_blank');if(w){w.document.write(`<pre style="white-space:pre-wrap;font:16px Georgia;max-width:800px;margin:50px auto;line-height:1.6">${txt.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>`);w.document.title='Proposta de Honorários';w.print()}}
 return <div className="module"><div className="page-title"><h1>Honorários & Propostas</h1><p>Precificação estratégica da demanda e geração de proposta comercial.</p></div>
 <div className="system-bar"><span>⚖ INTELIGÊNCIA DE PRECIFICAÇÃO</span><span className="online">● SIMULAÇÃO INTERNA</span></div>
 <div className="integration-panel"><div className="integration-head"><div><span className="integration-pill"><Calculator size={14}/> NOVA PRECIFICAÇÃO</span><h2>Demanda e esforço profissional</h2><p>Os valores são recomendações internas. A decisão final é sempre da advogada responsável.</p></div><button className="secondary" onClick={reset}><RefreshCw size={16}/> Limpar</button></div>
 <div className="advanced-grid">
 <label>Nome / lead<input value={f.nome} onChange={e=>set('nome',e.target.value)} placeholder="Opcional"/></label>
 <label>Área<select value={f.area} onChange={e=>set('area',e.target.value)}>{Object.keys(areas).map(x=><option key={x}>{x}</option>)}</select></label>
 <label className="wide">Demanda<input value={f.demanda} onChange={e=>set('demanda',e.target.value)} placeholder="Ex.: modificação de guarda com pedido urgente"/></label>
 <label>Fase<select value={f.fase} onChange={e=>set('fase',e.target.value)}><option>Inicial</option><option>Em andamento</option><option>Execução</option><option>Recursal</option></select></label>
 <label>Complexidade (1–5)<input type="number" min="1" max="5" value={f.complexidade} onChange={e=>set('complexidade',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Urgência (1–5)<input type="number" min="1" max="5" value={f.urgencia} onChange={e=>set('urgencia',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Volume documental (1–5)<input type="number" min="1" max="5" value={f.documentos} onChange={e=>set('documentos',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Audiências estimadas<input type="number" min="0" value={f.audiencias} onChange={e=>set('audiencias',Math.max(0,+e.target.value||0))}/></label>
 <label>Atuações/processos<input type="number" min="1" value={f.processos} onChange={e=>set('processos',Math.max(1,+e.target.value||1))}/></label>
 <label>Horas estimadas<input type="number" min="0" value={f.horas} onChange={e=>set('horas',Math.max(0,+e.target.value||0))}/></label>
 <label>Valor econômico (R$)<input type="number" min="0" value={f.valorEconomico} onChange={e=>set('valorEconomico',Math.max(0,+e.target.value||0))}/></label>
 <label><span>Perícia</span><input type="checkbox" checked={f.pericia} onChange={e=>set('pericia',e.target.checked)}/></label>
 <label><span>Provável recurso</span><input type="checkbox" checked={f.recurso} onChange={e=>set('recurso',e.target.checked)}/></label>
 </div></div>
 <div className="dashboard-kpis" style={{marginTop:16}}>
 <div className="dashboard-kpi"><div className="dashboard-kpi-head"><Scale size={18}/></div><strong>{money(calc.minimo)}</strong><span>Mínimo recomendado</span></div>
 <div className="dashboard-kpi"><div className="dashboard-kpi-head"><TrendingUp size={18}/></div><strong>{money(calc.ideal)}</strong><span>Valor ideal</span></div>
 <div className="dashboard-kpi"><div className="dashboard-kpi-head"><ShieldCheck size={18}/></div><strong>{money(calc.premium)}</strong><span>Valor premium</span></div>
 <div className="dashboard-kpi"><strong>{calc.score}/10</strong><span>Índice de esforço Lex</span></div></div>
 <div className="integration-panel" style={{marginTop:16}}><div className="integration-head"><div><h2>Condição de pagamento</h2><p>Simule a proposta a partir do valor ideal calculado.</p></div></div><div className="advanced-grid"><label>Entrada (%)<input type="number" min="0" max="100" value={f.entrada} onChange={e=>set('entrada',+e.target.value||0)}/></label><label>Parcelas do saldo<input type="number" min="1" max="60" value={f.parcelas} onChange={e=>set('parcelas',Math.min(60,Math.max(1,+e.target.value||1)))}/></label><label>Entrada sugerida<input disabled value={money(calc.entrada)}/></label><label>Valor da parcela<input disabled value={money(calc.parcela)}/></label></div><button className="primary" onClick={proposal}><FileText size={16}/> Gerar proposta</button></div>
 <div className="integration-notice" style={{marginTop:16}}>Referência interna de precificação. Antes da contratação, confira a tabela de honorários aplicável, o escopo efetivo e as particularidades do caso.</div>
 </div>
}