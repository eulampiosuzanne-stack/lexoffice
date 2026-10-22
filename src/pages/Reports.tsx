import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {RefreshCw,Users,CircleDollarSign,Gavel,MessageCircle,AlertTriangle,CalendarDays,ArrowUpRight,ChevronRight,Info,Bell,FileText,Scale} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {intervalo,reportDay,reportDateBounds,reportPeriods,reportSources,buildReport,type ReportPeriod,type ReportResults} from '../lib/reportWorkspace';
import './report-workspace.css';
export {intervalo} from '../lib/reportWorkspace';
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const shortDate=(value:Date)=>value.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short',year:'numeric'});
function rangeLabel(from:Date,until:Date){
 const end=new Date(until.getTime()-1);
 if(reportDay(from).slice(0,7)===reportDay(end).slice(0,7))return from.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit'})+' – '+end.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'long',year:'numeric'});
 return shortDate(from)+' a '+shortDate(end);
}

type Snapshot={period:ReportPeriod;result:ReturnType<typeof buildReport>;from:Date;until:Date;updated:Date};
export default function Reports(){
 const [period,setPeriod]=useState<ReportPeriod>('mes');
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const request=useRef(0);
 async function load(selected:ReportPeriod){
  const id=++request.current;
  setLoading(true);setError('');setSnapshot(null);
  if(!supabase){setError('Serviço de dados indisponível. Tente atualizar.');setLoading(false);return;}
  const now=new Date(),{de,ate}=intervalo(selected,now);
  const a=de.toISOString(),b=ate.toISOString();
  const {from:dateA,until:dateB,today}=reportDateBounds(selected,now);
  const sb=supabase;
  try{
   const queries=[
    sb.from('leads').select('stage_key,origin',{count:'exact'}).gte('created_at',a).lt('created_at',b).limit(5000),
    sb.from('financial_entry_payments').select('amount',{count:'exact'}).gte('paid_at',a).lt('paid_at',b).limit(5000),
    sb.from('financial_entries').select('amount',{count:'exact'}).eq('type','income').gte('due_date',dateA).lt('due_date',dateB).neq('status','paid').limit(5000),
    sb.from('financial_entries').select('amount',{count:'exact'}).eq('type','income').lt('due_date',today).not('status','in','(paid,cancelled)').limit(5000),
    sb.from('process_movements').select('id',{count:'exact',head:true}).gte('created_at',a).lt('created_at',b),
    sb.from('process_hearings').select('id',{count:'exact',head:true}).gte('starts_at',a).lt('starts_at',b),
    sb.from('process_deadlines').select('id',{count:'exact',head:true}).gte('due_at',a).lt('due_at',b),
    sb.from('process_deadlines').select('id',{count:'exact',head:true}).gte('due_at',a).lt('due_at',b).not('completed_at','is',null),
    sb.from('processes').select('id',{count:'exact',head:true}).gte('created_at',a).lt('created_at',b),
    sb.from('whatsapp_messages').select('id',{count:'exact',head:true}).eq('direction','inbound').gte('created_at',a).lt('created_at',b),
    sb.from('whatsapp_messages').select('id',{count:'exact',head:true}).eq('direction','outbound').gte('created_at',a).lt('created_at',b),
    sb.from('ai_agent_alerts').select('id',{count:'exact',head:true}).neq('agent_key','system').gte('created_at',a).lt('created_at',b),
    sb.from('processes').select('client_id,clients!inner(id,phone,whatsapp)',{count:'exact'}).not('client_id','is',null).limit(3000),
   ];
   const settled=await Promise.allSettled(queries);
   if(id!==request.current)return;
   const keys=Object.keys(reportSources) as (keyof ReportResults)[];
   const results=Object.fromEntries(settled.map((result,index)=>[keys[index],result.status==='fulfilled'?result.value:{data:null,error:result.reason,count:null}])) as ReportResults;
   const result=buildReport(results);
   setSnapshot({period:selected,result,from:de,until:ate,updated:new Date()});
   if(result.failed.length)setError('Dados indisponíveis: '+result.failed.join(', ')+'. Os demais indicadores foram carregados. Tente atualizar.');
  }catch{if(id===request.current)setError('Não foi possível montar o relatório agora. Tente atualizar.');}
  finally{if(id===request.current)setLoading(false);}
 }
 useEffect(()=>{void load(period);return()=>{request.current++;};},[period]);
 const data=snapshot?.result.data;
 const number=(value:number|null|undefined)=>loading?'—':value==null?'Indisponível':String(value);
 const currency=(value:number|null|undefined)=>loading?'—':value==null?'Indisponível':money(value);
 const range=snapshot||{from:intervalo(period).de,until:intervalo(period).ate};
 const origins=data?.origens;
 const originMax=Math.max(1,...(origins||[]).map(([,value])=>value));
 const leadRate=data?.leadsNovos&&data.leadsContratados!=null?Math.round(data.leadsContratados/data.leadsNovos*100):null;
 const deadlineRate=data?.prazos&&data.prazosConcluidos!=null?Math.min(100,Math.max(0,data.prazosConcluidos/data.prazos*100)):null;
 const contactCount=data?.semWhatsApp;
 return <div className="report-workspace" aria-busy={loading}>
  <header className="report-heading"><div><h1>Relatórios</h1><p>Resultados do escritório, com contexto para decidir.</p></div><div className="report-toolbar">{snapshot&&<small>{snapshot.result.failed.length?'Consulta parcial':'Atualizado'} às {snapshot.updated.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</small>}<button className="report-button" disabled={loading} onClick={()=>void load(period)}><RefreshCw size={16}/>{loading?'Atualizando…':'Atualizar'}</button></div></header>
  <div className="report-period-bar"><label htmlFor="report-period"><CalendarDays size={17}/><span className="sr-only">Período do relatório</span><select id="report-period" value={period} onChange={event=>setPeriod(event.target.value as ReportPeriod)}>{(Object.keys(reportPeriods) as ReportPeriod[]).map(key=><option value={key} key={key}>{reportPeriods[key]}</option>)}</select></label><span>{rangeLabel(range.from,range.until)}</span><small><Info size={15}/>Posições atuais sinalizadas separadamente.</small></div>
  {error&&<div className="report-error" role="alert">{error}</div>}
  <div className="report-kpis">{[
   {title:'Leads novos',value:number(data?.leadsNovos),icon:Users,tone:'blue',href:'/crm'},
   {title:'Recebido no período',value:currency(data?.recebido),icon:CircleDollarSign,tone:'gold',href:'/financeiro/recebimentos'},
   {title:'Processos novos',value:number(data?.processosNovos),icon:Scale,tone:'blue',href:'/processos'},
   {title:'Mensagens recebidas',value:number(data?.msgRecebidas),icon:MessageCircle,tone:'green',href:'/whatsapp'},
  ].map(({title,value,icon:Icon,tone,href})=><Link key={title} to={href} className="report-surface report-kpi"><span className={`report-icon report-${tone}`}><Icon size={23}/></span><div><strong title={value}>{value}</strong><span>{title}</span><small>No período selecionado.</small></div><ChevronRight size={16}/></Link>)}</div>
  <div className="report-sections">
   <section className="report-surface report-commercial"><div className="report-section-heading"><h2>Comercial</h2><Link to="/crm">Abrir comercial <ArrowUpRight size={14}/></Link></div><div className="report-contract-rate"><div><strong>Leads do período em etapa contratada</strong><span>{data?.leadsNovos!=null&&data.leadsContratados!=null?`${data.leadsContratados} de ${data.leadsNovos}${leadRate!==null?` · ${leadRate}%`:''}`:number(null)}</span></div><small>Etapa atual dos leads cadastrados no período.</small></div><h3>Origem dos leads</h3>{loading?<p className="report-empty" role="status">Consultando origens…</p>:origins===null||origins===undefined?<p className="report-empty">Origens indisponíveis.</p>:!origins.length?<p className="report-empty">Nenhum lead registrado no período.</p>:<div className="report-origin-bars">{origins.map(([label,value])=><div key={label}><span>{label}</span><span className="report-track" aria-hidden="true"><span style={{width:`${value/originMax*100}%`}}/></span><strong>{value}</strong></div>)}</div>}</section>
   <section className="report-surface report-financial"><div className="report-section-heading"><h2>Financeiro</h2><Link to="/financeiro/recebimentos">Abrir financeiro <ArrowUpRight size={14}/></Link></div><div className="report-finance-body"><small className="report-scope-label">Com vencimento no período</small><strong className="report-finance-value">{currency(data?.aReceberPeriodo)}</strong><h3>A receber no período</h3><small>Parcelas do período ainda em aberto.</small><div className="report-current-position"><span className="report-badge">Posição atual · {shortDate(snapshot?.updated||new Date())}</span><strong>{currency(data?.vencidoAberto)}</strong><h3>Em atraso hoje</h3><small>{data?.qtdVencidas==null?number(null):`${data.qtdVencidas} ${data.qtdVencidas===1?'parcela vencida':'parcelas vencidas'} em aberto.`}</small></div></div></section>
   <section className="report-surface report-processes"><div className="report-section-heading"><h2>Processos</h2><Link to="/processos">Abrir processos <ArrowUpRight size={14}/></Link></div><dl className="report-data-rows"><div><dt><FileText size={17}/>Andamentos registrados</dt><dd>{number(data?.andamentos)}</dd></div><div><dt><Gavel size={17}/>Audiências</dt><dd>{number(data?.audiencias)}</dd></div><div><dt><CalendarDays size={17}/>Prazos com vencimento no período</dt><dd>{number(data?.prazos)}</dd></div></dl><div className="report-deadline-progress"><span>{data?.prazos!=null&&data.prazosConcluidos!=null?`${data.prazosConcluidos} de ${data.prazos} prazos concluídos`:number(null)}</span>{deadlineRate!==null&&<div role="progressbar" aria-label="Prazos concluídos no cadastro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(deadlineRate)} className="report-track"><span style={{width:`${deadlineRate}%`}}/></div>}<small>{data?.prazos===0?'Nenhum prazo com vencimento no período.':'Situação registrada dos prazos selecionados.'}</small></div></section>
   <section className="report-surface report-service"><div className="report-section-heading"><h2>Atendimento</h2><Link to="/whatsapp">Abrir atendimento <ArrowUpRight size={14}/></Link></div><dl className="report-data-rows"><div><dt><MessageCircle size={17}/>Mensagens enviadas</dt><dd>{number(data?.msgEnviadas)}</dd></div><div><dt><Bell size={17}/>Alertas para a Dra.</dt><dd>{number(data?.alertas)}</dd></div></dl><small className="report-service-note">Contagens registradas no período selecionado.</small><div className={`report-contact-quality ${contactCount===0?'report-contact-complete':''}`}><AlertTriangle size={20}/><div><div className="report-contact-heading"><strong>{contactCount==null?loading?'Consultando contatos…':'Contatos indisponíveis.':contactCount===0?'Nenhum cliente com processo sem contato registrado.':`${contactCount} ${contactCount===1?'cliente com processo':'clientes com processo'} sem WhatsApp ou telefone`}</strong><span className="report-badge">Posição atual</span></div><small>{contactCount===0?'Conferência baseada nos cadastros disponíveis.':'Complete os contatos para viabilizar os avisos.'}</small><Link to="/clientes">Revisar cadastros <ArrowUpRight size={13}/></Link></div></div></section>
  </div>
  <p className="report-footnote"><Info size={15}/>Indicadores baseados nos registros disponíveis. Zero indica ausência de registros retornados; falhas de consulta aparecem como indisponíveis.</p>
  {!!snapshot?.result.limited.length&&<p className="report-footnote">Consulta limitada em {snapshot.result.limited.join(', ')}. Os valores podem representar apenas parte dos registros.</p>}
 </div>;
}
