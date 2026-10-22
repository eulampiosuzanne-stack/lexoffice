import {useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {RefreshCw,Wallet,Users,FileText,TriangleAlert,ArrowUpRight,ChevronRight,ChevronLeft,Search,Info} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {leadDistribution,contractRanking,inactiveProcesses,panelSearch,type PanelEntry,type PanelLead,type PanelContract,type PanelProcess} from '../lib/managementPanel';
import './management-panel.css';

const cash=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const PAGE_SIZE=3;
export default function PartnerPanel(){
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [entries,setEntries]=useState<PanelEntry[]|null>(null),[leads,setLeads]=useState<PanelLead[]|null>(null),[contracts,setContracts]=useState<PanelContract[]|null>(null),[processes,setProcesses]=useState<PanelProcess[]|null>(null),[clients,setClients]=useState<Record<string,string>>({});
 const [updated,setUpdated]=useState<string|null>(null),[days,setDays]=useState(30),[search,setSearch]=useState(''),[page,setPage]=useState(0);
 const searchInput=useRef<HTMLInputElement>(null);
 async function load(){
  if(!supabase){setError('A conexão com o banco não está configurada.');setLoading(false);return;}
  setLoading(true);setError('');
  try{
   const [e,l,c,p]=await Promise.all([
    supabase.from('financial_entries').select('amount,status,category,type').eq('type','income').ilike('category','%honor%').in('status',['pending','overdue']).limit(5000),
    supabase.from('leads').select('id,stage_key,potential_value').limit(5000),
    supabase.from('fee_contracts').select('id,client_id,total_amount,status').in('status',['active','awaiting_success']).limit(5000),
    supabase.from('process_last_activity').select('process_id,client_id,cnj_number,internal_number,subject,status,updated_at,latest_movement_at').limit(5000)
   ]);
   setEntries(e.error?null:(e.data||[]) as PanelEntry[]);setLeads(l.error?null:(l.data||[]) as PanelLead[]);setContracts(c.error?null:(c.data||[]) as PanelContract[]);setProcesses(p.error?null:(p.data||[]) as PanelProcess[]);
   const failed=[e.error&&'honorários',l.error&&'leads',c.error&&'contratos',p.error&&'processos'].filter(Boolean);
   const ids=[...new Set([...(c.error?[]:c.data||[]),...(p.error?[]:p.data||[])].map(item=>item.client_id).filter((id):id is string=>!!id))];
   setClients({});
   if(ids.length){const result=await supabase.from('clients').select('id,name').in('id',ids);if(result.error)failed.push('nomes dos clientes');else setClients(Object.fromEntries((result.data||[]).map(item=>[item.id,item.name])));}
   setError(failed.length?'Alguns dados não puderam ser carregados: '+failed.join(', ')+'. Confira suas permissões e tente atualizar.':'');
   setUpdated(new Date().toISOString());
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível atualizar o painel. Tente novamente.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 const receivable=useMemo(()=>entries?.reduce((sum,item)=>sum+(Number(item.amount)||0),0)??null,[entries]);
 const distribution=useMemo(()=>leads?leadDistribution(leads):[],[leads]);
 const ranking=useMemo(()=>contracts?contractRanking(contracts,clients):[],[contracts,clients]);
 const snapshot=updated?Date.parse(updated):Date.now();
 const stale=useMemo(()=>processes?inactiveProcesses(processes,30,snapshot):[],[processes,snapshot]);
 const filtered=useMemo(()=>{
  const query=panelSearch(search);
  return (processes?inactiveProcesses(processes,days,snapshot):[]).filter(item=>!query||panelSearch([item.cnj_number,item.internal_number,item.subject,clients[item.client_id||'']].filter(Boolean).join(' ')).includes(query));
 },[processes,days,snapshot,search,clients]);
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 const currentPage=Math.min(page,pages-1);
 const visible=filtered.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE);
 const maxStage=Math.max(1,...distribution.map(item=>item.count));
 const maxContract=Math.max(1,...ranking.map(item=>item.total));
 const unavailable=loading?'…':'Indisponível';
 const limited=[entries,leads,contracts,processes].some(rows=>rows?.length===5000);
 function focusProcesses(){document.getElementById('management-processes')?.scrollIntoView({behavior:'smooth',block:'start'});searchInput.current?.focus({preventScroll:true});}
 return <div className="management-panel" aria-busy={loading}>
  <header className="management-heading"><div><h1>Painel gerencial</h1><p>Uma visão clara da carteira, do comercial e do financeiro.</p></div><div className="management-toolbar">{updated&&<small>{error?'Consulta parcial':'Atualizado'} às {new Date(updated).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</small>}<button className="management-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/>{loading?'Atualizando…':'Atualizar'}</button></div></header>
  {error&&<div className="management-error" role="alert">{error}</div>}
  <div className="management-metrics">
   <Link className="management-card management-metric" to="/financeiro/recebimentos"><span className="management-icon management-blue"><Wallet size={23}/></span><div><strong>{receivable===null?unavailable:cash(receivable)}</strong><span>Honorários a receber</span><small>{entries?`${entries.length} lançamentos pendentes ou vencidos`:'Honorários cadastrados'}</small></div><ChevronRight size={15}/></Link>
   <Link className="management-card management-metric" to="/crm"><span className="management-icon management-green"><Users size={23}/></span><div><strong>{leads?.length??unavailable}</strong><span>Leads cadastrados</span><small>{leads?`Distribuídos em ${distribution.length} etapas`:'Distribuição por etapa'}</small></div><ChevronRight size={15}/></Link>
   <Link className="management-card management-metric" to="/financeiro/contratos"><span className="management-icon management-gold"><FileText size={23}/></span><div><strong>{contracts?.length??unavailable}</strong><span>Contratos ativos</span><small>Inclui aguardando êxito</small></div><ChevronRight size={15}/></Link>
   <button className="management-card management-metric" onClick={focusProcesses}><span className="management-icon management-danger"><TriangleAlert size={23}/></span><div><strong>{processes?stale.length:unavailable}</strong><span>Processos para acompanhar</span><small>Sem atividade registrada há 30+ dias{stale.some(item=>item.days===null)?' ou sem data':''}</small></div><ChevronRight size={15}/></button>
  </div>
  <div className="management-overview">
   <section className="management-card management-distribution"><div className="management-section-heading"><div><h2>Distribuição de leads</h2><p>Quantidade atual por etapa · não representa conversão</p></div><Link to="/crm">Abrir comercial <ArrowUpRight size={14}/></Link></div>{leads===null?<p className="management-empty">{loading?'Consultando leads…':'Dados de leads indisponíveis para sua conta.'}</p>:!leads.length?<p className="management-empty">Nenhum lead cadastrado.</p>:<div className="management-bars">{distribution.map(item=><div key={item.key} className="management-bar-row"><span>{item.label}</span><div className={`management-track ${item.key==='perdido'?'management-track-muted':''}`} aria-hidden="true"><span style={{width:`${item.count/maxStage*100}%`}}/></div><strong>{item.count}</strong></div>)}</div>}<small className="management-section-footer">{leads&&`${leads.length} leads nos registros consultados`}</small></section>
   <section className="management-card management-ranking"><div className="management-section-heading"><div><h2>Carteira por valor contratado</h2><p>5 maiores clientes · contratos ativos e aguardando êxito</p></div><Link to="/financeiro/contratos">Ver contratos <ArrowUpRight size={14}/></Link></div>{contracts===null?<p className="management-empty">{loading?'Consultando contratos…':'Dados de contratos indisponíveis para sua conta.'}</p>:!ranking.length?<p className="management-empty">Não há contratos ativos com cliente associado.</p>:<ol className="management-client-list">{ranking.map((item,index)=><li key={item.id}><span className="management-rank">{index+1}</span><div><Link to={'/clientes/'+encodeURIComponent(item.id)}>{item.name}</Link><div className="management-client-meta"><small>{item.count} {item.count===1?'contrato':'contratos'}</small><span className="management-track" aria-hidden="true"><span style={{width:`${Math.max(0,item.total)/maxContract*100}%`}}/></span></div></div><strong>{cash(item.total)}</strong></li>)}</ol>}<p className="management-info"><Info size={16}/>Valor contratado não significa valor já recebido.</p></section>
  </div>
  <section id="management-processes" className="management-card management-processes"><div className="management-section-heading"><div><div className="management-process-title"><h2>Processos que precisam de acompanhamento</h2>{processes&&<span className="management-badge management-danger">{filtered.length} registros</span>}</div><p>Sem atividade cadastrada há {days} dias ou mais. Confira a situação no tribunal.</p></div><div className="management-process-tools"><label className="sr-only" htmlFor="management-days">Tempo sem atividade registrada</label><select id="management-days" value={days} onChange={event=>{setDays(Number(event.target.value));setPage(0);}}><option value={30}>30 dias ou mais</option><option value={60}>60 dias ou mais</option><option value={90}>90 dias ou mais</option></select><Link to="/processos">Abrir processos <ArrowUpRight size={14}/></Link></div></div>
   <label className="management-search"><Search size={16}/><span className="sr-only">Buscar cliente ou processo</span><input ref={searchInput} placeholder="Buscar cliente ou processo" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}}/></label>
   {processes===null?<p className="management-empty" role="status">{loading?'Consultando processos…':'Dados de processos indisponíveis para sua conta.'}</p>:filtered.length?<><div className="management-table-scroll"><table aria-label="Processos para acompanhar"><thead><tr><th>Processo / Cliente</th><th>Última atividade registrada</th><th>Tempo sem atualização</th><th>Ação</th></tr></thead><tbody>{visible.map(item=><tr key={item.process_id}><td><strong>{item.cnj_number||item.internal_number||'Processo sem número'}</strong><small>{clients[item.client_id||'']||'Cliente não identificado'} · {item.subject||'Assunto não informado'}</small></td><td>{item.last?new Date(item.last).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Sem data registrada'}{item.basis==='updated'&&item.last&&<small>Atualização do cadastro</small>}</td><td><span className="management-badge management-gold">{item.days===null?'Sem data':`${item.days} dias`}</span></td><td><Link to={'/processos/'+encodeURIComponent(item.process_id)}>Ver processo <ArrowUpRight size={14}/></Link></td></tr>)}</tbody></table></div><div className="management-pagination"><small role="status">Exibindo {currentPage*PAGE_SIZE+1}–{Math.min((currentPage+1)*PAGE_SIZE,filtered.length)} de {filtered.length} registros</small><div><button className="management-page-button" disabled={currentPage===0} aria-label="Página anterior" onClick={()=>setPage(currentPage-1)}><ChevronLeft size={16}/></button><span aria-live="polite">{currentPage+1} / {pages}</span><button className="management-page-button" disabled={currentPage>=pages-1} aria-label="Próxima página" onClick={()=>setPage(currentPage+1)}><ChevronRight size={16}/></button></div></div></>:<p className="management-empty" role="status">{search?'Nenhum processo encontrado para esta busca.':'Nenhum processo em aberto retornado para este intervalo.'}</p>}
   <p className="management-footnote"><Info size={15}/>Indicadores baseados nos dados cadastrados. Atualização do cadastro não equivale a andamento judicial.</p>
  </section>
  {limited&&<p className="management-footnote">Uma consulta atingiu o limite de 5.000 registros. Os indicadores podem representar apenas parte da carteira.</p>}
 </div>;
}
