import { useMemo,useState } from 'react';
import { AlertTriangle,Calculator,FileText,RefreshCw,Scale,ShieldCheck,TrendingUp,Upload,Paperclip,X } from 'lucide-react';

const money=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const areas:any={Familia:5000,Civel:5000,Consumidor:4000,Saude:6000,Bancario:5500,Trabalhista:5000,Previdenciario:4500,Empresarial:7000,Outro:5000};
const niveis=(v:number)=>v<=2?'BAIXA':v<=3?'MODERADA':v<=4?'ALTA':'MUITO ALTA';

export default function FeePricing(){
 const initial={nome:'',demanda:'',area:'Familia',fase:'Em andamento',complexidade:3,urgencia:2,documentos:2,trabalhoRestante:3,riscoProcessual:2,audiencias:1,processos:1,pericia:false,recurso:false,valorCausa:0,proveitoEconomico:0,pisoReferencia:0,horas:20,entrada:20,parcelas:10};
 const [f,setF]=useState(initial);
 const [arquivos,setArquivos]=useState<File[]>([]);
 const set=(k:string,v:any)=>setF(x=>({...x,[k]:v}));
 const addFiles=(list:FileList|null)=>{if(!list)return;setArquivos(prev=>{const next=[...prev];for(const file of Array.from(list)){if(!next.some(x=>x.name===file.name&&x.size===file.size))next.push(file)}return next.slice(0,20)})};
 const removeFile=(i:number)=>setArquivos(x=>x.filter((_,idx)=>idx!==i));

 const calc=useMemo(()=>{
  const base=areas[f.area]||5000;
  const fator=1+(f.complexidade-1)*.10+(f.urgencia-1)*.06+(f.documentos-1)*.04+(f.trabalhoRestante-1)*.08+(f.riscoProcessual-1)*.06+Math.max(0,f.audiencias-1)*.05+Math.max(0,f.processos-1)*.18+(f.pericia?.15:0)+(f.fase==='Recursal'?.18:f.fase==='Execução'?.10:0);
  const horas=Math.max(0,f.horas)*180;
  const referenciaEconomica=Math.max(0,f.proveitoEconomico||f.valorCausa);
  const componenteEconomico=referenciaEconomica*.05;
  const tecnico=Math.max(base*.55*fator,horas,componenteEconomico);
  const piso=Math.max(0,f.pisoReferencia);
  const faixaPctMin=Math.min(.42,.22+(f.complexidade-1)*.025+(f.trabalhoRestante-1)*.025+(f.urgencia-1)*.0125);
  const faixaPctMax=Math.min(.55,faixaPctMin+.10);
  const faixaMin=referenciaEconomica>0?referenciaEconomica*faixaPctMin:tecnico*.85;
  const faixaMax=referenciaEconomica>0?referenciaEconomica*faixaPctMax:tecnico;
  const comercial=Math.max(piso,Math.min(tecnico,(faixaMin+faixaMax)/2));
  const proporcao=referenciaEconomica>0?comercial/referenciaEconomica:0;
  const proporcaoTecnica=referenciaEconomica>0?tecnico/referenciaEconomica:0;
  const gap=tecnico>0?(tecnico-comercial)/tecnico:0;
  const alerta=referenciaEconomica>0&&proporcaoTecnica>=.5;
  const sugerirFases=referenciaEconomica>0&&proporcaoTecnica>=.75&&gap>=.30&&f.trabalhoRestante>=4;
  const pisoIncompativel=referenciaEconomica>0&&piso>faixaMax;
  const entrada=comercial*(Math.min(100,Math.max(0,f.entrada))/100);
  const saldo=Math.max(0,comercial-entrada);
  const score=Math.min(10,Math.max(1,Math.round((fator-1)*5+3)));
  return{tecnico,comercial,referenciaEconomica,faixaMin,faixaMax,proporcao,proporcaoTecnica,alerta,sugerirFases,pisoIncompativel,entrada,parcela:saldo/Math.max(1,f.parcelas),score};
 },[f]);

 function reset(){setF(initial);setArquivos([])}
 function proposal(){
  const txt=`PROPOSTA DE HONORÁRIOS ADVOCATÍCIOS\n\nSuzanne Figueiredo Advocacia e Soluções Jurídicas\n\nInteressado(a): ${f.nome||'A definir'}\nDemanda: ${f.demanda||f.area}\n\nHonorários propostos: ${money(calc.comercial)}\nEntrada: ${money(calc.entrada)}\nSaldo: ${f.parcelas} parcela(s) de ${money(calc.parcela)}.\n\nEscopo e eventuais fases posteriores devem ser definidos no contrato. O valor foi submetido à análise de esforço técnico e proporcionalidade econômica e permanece sujeito à validação da advogada responsável.`;
  const w=window.open('','_blank');
  if(w){w.document.write(`<pre style="white-space:pre-wrap;font:16px Georgia;max-width:800px;margin:50px auto;line-height:1.6">${txt.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>`);w.document.title='Proposta de Honorários';w.print()}
 }

 return <div className="module"><div className="page-title"><h1>Honorários & Propostas</h1><p>Precificação estratégica com esforço técnico, proveito econômico e proporcionalidade comercial.</p></div>
 <div className="system-bar"><span>⚖ INTELIGÊNCIA DE PRECIFICAÇÃO</span><span className="online">● SIMULAÇÃO INTERNA</span></div>
 <div className="integration-panel"><div className="integration-head"><div><span className="integration-pill"><Calculator size={14}/> NOVA PRECIFICAÇÃO</span><h2>Demanda, esforço e dimensão econômica</h2><p>A Lex calcula o custo técnico e depois testa a viabilidade econômica da proposta. A decisão final é da advogada.</p></div><button className="secondary" onClick={reset}><RefreshCw size={16}/> Limpar</button></div>
 <div className="fee-case-workspace">
  <label className="fee-case-label">Relato completo do caso
   <textarea className="fee-case-textarea" value={f.demanda} onChange={e=>set('demanda',e.target.value)} placeholder="Cole ou escreva aqui o relato do caso, histórico, pedidos, fase processual, riscos, urgências e tudo o que a Lex deve considerar na precificação."/>
  </label>
  <div className="fee-upload-zone">
   <div><Paperclip size={18}/><strong>Documentos do caso</strong><span>PDF, Word e imagens para compor a análise de honorários</span></div>
   <label className="primary fee-upload-btn"><Upload size={16}/> Anexar arquivos<input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" hidden onChange={e=>{addFiles(e.target.files);e.currentTarget.value=''}}/></label>
  </div>
  {arquivos.length>0&&<div className="fee-file-list">{arquivos.map((a,i)=><div className="fee-file-chip" key={a.name+a.size}><FileText size={14}/><span>{a.name}</span><small>{(a.size/1024/1024).toFixed(2)} MB</small><button type="button" onClick={()=>removeFile(i)} title="Remover"><X size={13}/></button></div>)}</div>}
  <div className="fee-analysis-note"><ShieldCheck size={15}/><span><b>Base da análise:</b> relato + documentos anexados + parâmetros abaixo. Os arquivos ficam preparados nesta simulação para a etapa de leitura inteligente.</span></div>
 </div>
 <div className="fee-section"><div className="fee-section-title"><span>01</span><div><b>Identificação e enquadramento</b><small>Dados essenciais da contratação e do processo.</small></div></div><div className="advanced-grid fee-form-grid">
 <label>Nome / lead<input value={f.nome} onChange={e=>set('nome',e.target.value)} placeholder="Opcional"/></label>
 <label>Área<select value={f.area} onChange={e=>set('area',e.target.value)}>{Object.keys(areas).map(x=><option key={x}>{x}</option>)}</select></label>
 <label className="wide">Resumo / identificação da demanda<input value={f.demanda.split('\n')[0]||''} onChange={e=>set('demanda',e.target.value+(f.demanda.includes('\n')?'\n'+f.demanda.split('\n').slice(1).join('\n'):''))} placeholder="Ex.: ação consumerista já ajuizada"/></label>
 <label>Fase<select value={f.fase} onChange={e=>set('fase',e.target.value)}><option>Inicial</option><option>Em andamento</option><option>Execução</option><option>Recursal</option></select></label>
 <label>Complexidade (1–5)<input type="number" min="1" max="5" value={f.complexidade} onChange={e=>set('complexidade',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Urgência (1–5)<input type="number" min="1" max="5" value={f.urgencia} onChange={e=>set('urgencia',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Volume documental (1–5)<input type="number" min="1" max="5" value={f.documentos} onChange={e=>set('documentos',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Trabalho restante (1–5)<input type="number" min="1" max="5" value={f.trabalhoRestante} onChange={e=>set('trabalhoRestante',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Risco processual atual (1–5)<input type="number" min="1" max="5" value={f.riscoProcessual} onChange={e=>set('riscoProcessual',Math.min(5,Math.max(1,+e.target.value||1)))}/></label>
 <label>Audiências estimadas<input type="number" min="0" value={f.audiencias} onChange={e=>set('audiencias',Math.max(0,+e.target.value||0))}/></label>
 <label>Atuações/processos<input type="number" min="1" value={f.processos} onChange={e=>set('processos',Math.max(1,+e.target.value||1))}/></label>
 <label>Horas estimadas<input type="number" min="0" value={f.horas} onChange={e=>set('horas',Math.max(0,+e.target.value||0))}/></label>
 <label>Valor da causa (R$)<input type="number" min="0" value={f.valorCausa} onChange={e=>set('valorCausa',Math.max(0,+e.target.value||0))}/></label>
 <label>Proveito econômico estimado (R$)<input type="number" min="0" value={f.proveitoEconomico} onChange={e=>set('proveitoEconomico',Math.max(0,+e.target.value||0))} placeholder="Se conhecido"/></label>
 <label>Referência mínima aplicável (R$)<input type="number" min="0" value={f.pisoReferencia} onChange={e=>set('pisoReferencia',Math.max(0,+e.target.value||0))} placeholder="Tabela aplicável / validação humana"/></label>
 <label><span>Perícia</span><input type="checkbox" checked={f.pericia} onChange={e=>set('pericia',e.target.checked)}/></label>
 <label><span>Recurso incluído no escopo</span><input type="checkbox" checked={f.recurso} onChange={e=>set('recurso',e.target.checked)}/></label>
 </div></div></div>

 <div className="fee-section fee-results"><div className="fee-section-title"><span>02</span><div><b>Resultado da precificação</b><small>Leitura técnica, comercial e econômica em um único quadro.</small></div></div><div className="dashboard-kpis">
 <div className="dashboard-kpi"><div className="dashboard-kpi-head"><Scale size={18}/></div><strong>{money(calc.tecnico)}</strong><span>Valor técnico do trabalho</span></div>
 <div className="dashboard-kpi"><div className="dashboard-kpi-head"><TrendingUp size={18}/></div><strong>{money(calc.comercial)}</strong><span>Valor comercial sugerido · faixa {money(calc.faixaMin)}–{money(calc.faixaMax)}</span></div>
 <div className="dashboard-kpi"><div className="dashboard-kpi-head"><ShieldCheck size={18}/></div><strong>{calc.referenciaEconomica?Math.round(calc.proporcao*100)+'%':'—'}</strong><span>Honorários / referência econômica</span></div>
 <div className="dashboard-kpi"><strong>{calc.score}/10</strong><span>Índice de esforço Lex</span></div></div></div>

 {calc.alerta&&<div className="integration-notice" style={{marginTop:16}}><AlertTriangle size={16}/> <strong>Alerta de proporcionalidade:</strong> o valor técnico representa {Math.round(calc.proporcaoTecnica*100)}% da referência econômica. A Lex preserva o valor técnico e apresenta uma faixa comercial para decisão da advogada, sem tratar percentuais como teto jurídico.</div>}
 {calc.sugerirFases?<div className="integration-notice" style={{marginTop:12}}><AlertTriangle size={16}/> <strong>Considerar contratação por fase:</strong> a carga de trabalho remanescente é alta e a distância entre o valor técnico e a faixa comercial é relevante. O fracionamento é apenas uma alternativa de viabilidade e não altera automaticamente o escopo.</div>:calc.alerta&&<div className="integration-notice" style={{marginTop:12}}><ShieldCheck size={16}/> <strong>Contrato integral preservado:</strong> não há gatilho suficiente para recomendar fracionamento por fases neste cenário.</div>}
 {calc.pisoIncompativel&&<div className="integration-notice" style={{marginTop:12}}><AlertTriangle size={16}/> <strong>Revisão obrigatória:</strong> a referência mínima informada supera o ajuste comercial calculado. Não reduzir automaticamente. Validar tabela aplicável, escopo e modelo de contratação.</div>}

 <div className="fee-two-column"><div className="integration-panel fee-compact-panel"><div className="integration-head"><div><span className="fee-step">03</span><h2>Condição de pagamento</h2><p>Simulação calculada sobre o valor comercial sugerido, não sobre o custo técnico bruto.</p></div></div><div className="advanced-grid"><label>Entrada (%)<input type="number" min="0" max="100" value={f.entrada} onChange={e=>set('entrada',+e.target.value||0)}/></label><label>Parcelas do saldo<input type="number" min="1" max="60" value={f.parcelas} onChange={e=>set('parcelas',Math.min(60,Math.max(1,+e.target.value||1)))}/></label><label>Entrada sugerida<input disabled value={money(calc.entrada)}/></label><label>Valor da parcela<input disabled value={money(calc.parcela)}/></label></div><button className="primary" onClick={proposal}><FileText size={16}/> Gerar proposta</button></div>

 <div className="integration-panel fee-compact-panel"><div className="integration-head"><div><span className="fee-step">04</span><h2>Diagnóstico Lex</h2><p>Leitura conjunta do trabalho, risco e dimensão econômica.</p></div></div><div className="advanced-grid"><label>Complexidade<input disabled value={niveis(f.complexidade)}/></label><label>Trabalho remanescente<input disabled value={niveis(f.trabalhoRestante)}/></label><label>Urgência<input disabled value={niveis(f.urgencia)}/></label><label>Risco processual<input disabled value={niveis(f.riscoProcessual)}/></label><label>Escopo<input disabled value={f.recurso?'Fase selecionada + recurso':'Fase selecionada; recurso fora do escopo'}/></label><label>Viabilidade<input disabled value={calc.sugerirFases?'AVALIAR CONTRATAÇÃO POR FASE':'CONTRATO INTEGRAL ADEQUADO'}/></label></div></div>


 <style>{`

 .fee-section{margin-top:16px;padding:18px;border:1px solid rgba(255,217,120,.32);border-radius:16px;background:linear-gradient(145deg,rgba(23,17,12,.96),rgba(10,8,6,.96));box-shadow:inset 0 1px 0 rgba(255,243,196,.06)}
 .fee-section-title{display:flex;align-items:center;gap:11px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,217,120,.15)}
 .fee-section-title>span,.fee-step{display:grid;place-items:center;min-width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#9B5D12,#FFD978 45%,#FFF3C4 52%,#E3A83B);color:#080705;font-size:11px;font-weight:900;box-shadow:0 0 12px rgba(255,217,120,.14)}
 .fee-section-title b{display:block;color:#FFF3C4;font-size:14px}.fee-section-title small{display:block;color:#BDB4A6;margin-top:2px;font-size:11px;font-weight:400}
 .fee-form-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px 14px!important}.fee-form-grid .wide{grid-column:span 2}
 .fee-results .dashboard-kpis{margin:0!important;grid-template-columns:repeat(4,minmax(0,1fr))!important}
 .fee-two-column{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:16px;align-items:start}
 .fee-compact-panel{margin:0!important;height:100%}.fee-compact-panel .integration-head{margin-bottom:14px}.fee-compact-panel .integration-head>div{display:grid;grid-template-columns:auto 1fr;column-gap:9px;align-items:center}.fee-compact-panel .integration-head h2{margin:0!important}.fee-compact-panel .integration-head p{grid-column:2;margin-top:4px!important}
 .fee-compact-panel .advanced-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
 @media(max-width:1180px){.fee-form-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.fee-results .dashboard-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
 @media(max-width:900px){.fee-two-column{grid-template-columns:1fr}.fee-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
 @media(max-width:620px){.fee-form-grid,.fee-results .dashboard-kpis,.fee-compact-panel .advanced-grid{grid-template-columns:1fr!important}.fee-form-grid .wide{grid-column:auto}}

 .fee-case-workspace{margin:18px 0 20px;display:grid;gap:12px}
 .fee-case-label{display:grid;gap:8px;color:var(--lx-text-2);font-size:13px;font-weight:700}
 .fee-case-textarea{width:100%;min-height:180px;resize:vertical;padding:16px 18px!important;line-height:1.55!important;background:#080705!important;color:#F5F1E8!important;border:1px solid #C99443!important;border-radius:14px!important;box-shadow:inset 0 1px 0 rgba(255,243,196,.05),0 0 16px rgba(255,217,120,.06)!important}
 .fee-case-textarea:focus{outline:none!important;border-color:#FFD978!important;box-shadow:0 0 0 3px rgba(255,217,120,.10),0 0 20px rgba(255,217,120,.12)!important}
 .fee-upload-zone{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px;border:1px dashed #E3A83B;border-radius:14px;background:linear-gradient(135deg,rgba(227,168,59,.08),rgba(255,217,120,.025))}
 .fee-upload-zone>div{display:grid;grid-template-columns:auto 1fr;column-gap:9px;align-items:center}.fee-upload-zone strong{color:#FFD978}.fee-upload-zone span{grid-column:2;color:#BDB4A6;font-size:12px;margin-top:3px}
 .fee-upload-btn{display:flex!important;align-items:center;gap:7px;white-space:nowrap;cursor:pointer}
 .fee-file-list{display:flex;flex-wrap:wrap;gap:8px}.fee-file-chip{display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid rgba(255,217,120,.35);border-radius:10px;background:#100C08;color:#F5F1E8}.fee-file-chip small{color:#BDB4A6}.fee-file-chip button{border:0;background:transparent;color:#FFD978;display:grid;place-items:center;cursor:pointer;padding:2px}
 .fee-analysis-note{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-left:2px solid #FFD978;background:rgba(227,168,59,.055);color:#BDB4A6;font-size:12px}.fee-analysis-note svg{color:#FFD978;flex:none}
 @media(max-width:720px){.fee-upload-zone{align-items:stretch;flex-direction:column}.fee-upload-btn{justify-content:center}.fee-case-textarea{min-height:220px}}
 `}</style>
 <div className="integration-notice" style={{marginTop:16}}>A Lex calcula primeiro o valor técnico do trabalho e só depois testa a proporcionalidade econômica. O proveito econômico estimado tem prioridade sobre o valor da causa quando informado. A contratação por fase só é sugerida quando houver carga remanescente alta e diferença relevante entre valor técnico e viabilidade comercial. Percentuais são indicadores internos, nunca limites jurídicos. A decisão final permanece da advogada.</div>
 </div>
}