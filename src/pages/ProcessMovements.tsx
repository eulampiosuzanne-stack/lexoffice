import { useEffect,useMemo,useState } from 'react';
import { Activity,RefreshCw,Search,Gavel,Bot,Clock3,User,ShieldCheck,AlertTriangle,CheckCircle2,Eye,FileText,XCircle,Archive } from 'lucide-react';
import { supabase } from '../lib/supabase';

const dt=(v:any)=>v?new Date(v).toLocaleString('pt-BR'):'—';
const dateOnly=(v:any)=>v?new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).replace('.','').toUpperCase():'—';
const RECENT_DAYS=7;
function classify(title=''){
 const t=title.toLowerCase();
 if(/pris[aã]o|liminar|tutela|senten[cç]a|extin[cç][aã]o|tr[aâ]nsito|penhora|bloqueio|leil[aã]o|audi[eê]ncia|per[ií]cia|prazo|medida protetiva/.test(t)) return {label:'IMPORTANTE',tone:'important'};
 if(/conclus|decis[aã]o|despacho|intima[cç][aã]o|cita[cç][aã]o|expedi[cç][aã]o/.test(t)) return {label:'ATENÇÃO',tone:'attention'};
 return {label:'ROTINA',tone:'routine'};
}
function delivery(m:any,q:any){
 if(m.sent_to_client_at||q?.status==='sent')return{kind:'sent',label:'✓ ENVIADO AUTOMATICAMENTE AO CLIENTE',detail:q?.sent_at?`Enviado em ${dt(q.sent_at)}`:`Enviado em ${dt(m.sent_to_client_at)}`};
 if(q?.status==='awaiting_review')return{kind:'review',label:'⚠ PRECISA DA SUA APROVAÇÃO',detail:'Nenhuma mensagem será enviada antes da sua decisão.'};
 if(q?.status==='pending'||q?.status==='processing'||m.approved_for_client===true)return{kind:'authorized',label:'✓ AUTORIZADO · AGUARDANDO ENVIO',detail:'A comunicação já está autorizada e seguirá a fila automática.'};
 if(q?.status==='cancelled'||m.approved_for_client===false)return{kind:'blocked',label:'✕ NÃO SERÁ ENVIADO',detail:q?.last_error||'Comunicação cancelada ou não autorizada.'};
 return{kind:'held',label:'○ SEM ENVIO AO CLIENTE',detail:'Movimentação registrada; não há comunicação liberada neste momento.'};
}

export default function ProcessMovements(){
 const [rows,setRows]=useState<any[]>([]),[queue,setQueue]=useState<any[]>([]),[q,setQ]=useState(''),[loading,setLoading]=useState(true),[updated,setUpdated]=useState<Date|null>(null),[acting,setActing]=useState<string|null>(null),[notice,setNotice]=useState(''),[scope,setScope]=useState<'recent'|'all'>('recent');
 async function load(){
  if(!supabase)return;
  setLoading(true);setNotice('');
  const {data:{user}}=await supabase.auth.getUser();
  let orgId:string|null=null;
  if(user){const {data:p}=await supabase.from('profiles').select('org_id').eq('id',user.id).maybeSingle();orgId=p?.org_id||null}
  if(!orgId){setNotice('Não foi possível identificar o escritório desta sessão.');setRows([]);setQueue([]);setLoading(false);return}
  const [m,n]=await Promise.all([
   supabase.from('process_movements')
    .select('id,org_id,process_id,movement_date,title,description,source,client_message,approved_for_client,sent_to_client_at,created_at,processes(cnj_number,internal_number,subject,status,clients(name))')
    .eq('org_id',orgId).order('movement_date',{ascending:false}).order('created_at',{ascending:false}).limit(1000),
   supabase.from('process_notification_queue')
    .select('id,process_id,client_id,movement_id,notification_type,channel,scheduled_at,message_text,status,last_error,sent_at,clients(name),processes(cnj_number,internal_number,status)')
    .eq('org_id',orgId).order('scheduled_at',{ascending:false}).limit(1000)
  ]);
  if(m.error)setNotice(`Erro ao carregar andamentos: ${m.error.message}`);else setRows(m.data||[]);
  if(n.error)setNotice(v=>v?`${v} · Fila: ${n.error.message}`:`Erro ao carregar fila: ${n.error.message}`);else setQueue(n.data||[]);
  setUpdated(new Date());setLoading(false);
 }
 useEffect(()=>{load();const id=window.setInterval(load,45000);const focus=()=>load();window.addEventListener('focus',focus);return()=>{clearInterval(id);window.removeEventListener('focus',focus)}},[]);
 async function decide(item:any,approved:boolean){if(!supabase||acting)return;const ok=window.confirm(approved?'Autorizar esta comunicação para envio ao cliente?':'NÃO autorizar esta comunicação? Ela será cancelada e não será enviada ao cliente.');if(!ok)return;setActing(item.id);setNotice('');try{const {error:me}=await supabase.from('process_movements').update({approved_for_client:approved}).eq('id',item.movement_id);if(me)throw me;const patch=approved?{status:'pending',scheduled_at:new Date().toISOString(),last_error:null}:{status:'cancelled',last_error:'Não autorizado pela Dra. Suzanne'};const {error:qe}=await supabase.from('process_notification_queue').update(patch).eq('id',item.id);if(qe)throw qe;setNotice(approved?'✓ AUTORIZADO. O envio seguirá a fila automática.':'✕ NÃO AUTORIZADO. Esta comunicação foi cancelada.');await load()}catch(e:any){setNotice(`Erro: ${e?.message||'não foi possível concluir'}`)}finally{setActing(null)}}
 const cutoff=useMemo(()=>Date.now()-RECENT_DAYS*24*60*60*1000,[]);
 const scopedRows=useMemo(()=>rows.filter(x=>{
  if(scope==='all')return true;
  const movementTime=new Date(x.movement_date||0).getTime();
  return x.processes?.status==='active'&&Number.isFinite(movementTime)&&movementTime>=cutoff;
 }),[rows,scope,cutoff]);
 const visibleIds=useMemo(()=>new Set(scopedRows.map(x=>x.id)),[scopedRows]);
 const scopedQueue=useMemo(()=>queue.filter(x=>scope==='all'||visibleIds.has(x.movement_id)),[queue,scope,visibleIds]);
 const filtered=useMemo(()=>scopedRows.filter(x=>`${x.title||''} ${x.description||''} ${x.source||''} ${x.processes?.cnj_number||''} ${x.processes?.internal_number||''} ${x.processes?.clients?.name||''}`.toLowerCase().includes(q.toLowerCase())),[scopedRows,q]);
 const latestQueue=useMemo(()=>{const m=new Map<string,any>();for(const x of queue)if(x.movement_id&&!m.has(x.movement_id))m.set(x.movement_id,x);return m},[queue]);
 const reviewQueue=scopedQueue.filter(x=>x.status==='awaiting_review'),pendingQueue=scopedQueue.filter(x=>['pending','processing'].includes(x.status)),sentQueue=scopedQueue.filter(x=>x.status==='sent');
 return <div className="module movement-premium">
  <div className="page-head movement-page-head"><div><span className="movement-kicker">SF · INTELIGÊNCIA PROCESSUAL</span><h1>Movimentações Processuais</h1><p>{scope==='recent'?`Exibindo andamentos dos últimos ${RECENT_DAYS} dias em processos ativos.`:'Exibindo todo o histórico processual armazenado.'}</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className={scope==='recent'?'primary movement-refresh':'secondary movement-refresh'} onClick={()=>setScope('recent')}><Clock3 size={18}/> RECENTES</button><button className={scope==='all'?'primary movement-refresh':'secondary movement-refresh'} onClick={()=>setScope('all')}><Archive size={18}/> HISTÓRICO</button><button className="primary movement-refresh" onClick={load}><RefreshCw size={20}/> ATUALIZAR</button></div></div>
  <div className="movement-monitor-bar"><span><Activity size={19}/> MOTOR DE MONITORAMENTO</span><span className="online">● ATIVO · ATUALIZA A CADA 45s</span></div>
  <div className="movement-summary-grid"><div className="movement-stat"><strong>{scopedRows.length}</strong><span>{scope==='recent'?'Andamentos recentes':'Movimentações carregadas'}</span></div><div className="movement-stat movement-stat-review"><strong>{reviewQueue.length}</strong><span>PRECISAM DA SUA APROVAÇÃO</span></div><div className="movement-stat"><strong>{pendingQueue.length}</strong><span>Autorizadas / aguardando envio</span></div><div className="movement-stat"><strong>{sentQueue.length}</strong><span>ENVIADAS AUTOMATICAMENTE</span></div></div>
  <section className="movement-review-panel"><div className="movement-section-title"><div><Eye size={24}/><div><h2>PRECISA DA SUA APROVAÇÃO</h2><p>{scope==='recent'?'Somente comunicações recentes de processos ativos aparecem aqui.':'Itens do histórico que ainda dependem de decisão.'}</p></div></div><span className="movement-safe-pill"><ShieldCheck size={17}/> ENVIO BLOQUEADO ATÉ SUA DECISÃO</span></div>{notice&&<div className="movement-decision-notice">{notice}</div>}{reviewQueue.length===0?<div className="empty">Nenhuma comunicação aguardando sua aprovação neste período.</div>:<div className="movement-review-list">{reviewQueue.map(x=><article className="movement-review-item" key={x.id}><div className="movement-review-main"><strong className="movement-client-title">{x.clients?.name||'Cliente'} · {x.processes?.cnj_number||x.processes?.internal_number||'Processo'}</strong>{x.message_text&&<div className="movement-message-preview"><b>MENSAGEM QUE SERÁ ENVIADA SE VOCÊ APROVAR:</b><p>{x.message_text}</p></div>}{x.last_error&&<div className="movement-note"><AlertTriangle size={17}/>{x.last_error}</div>}</div><div className="movement-review-actions"><span className="movement-status review">⚠ AGUARDANDO SUA APROVAÇÃO</span><button className="movement-decision approve" disabled={acting===x.id} onClick={()=>decide(x,true)}><CheckCircle2 size={22}/><span><b>AUTORIZAR ENVIO</b><small>Liberar para o cliente</small></span></button><button className="movement-decision reject" disabled={acting===x.id} onClick={()=>decide(x,false)}><XCircle size={22}/><span><b>NÃO AUTORIZAR</b><small>Não enviar ao cliente</small></span></button></div></article>)}</div>}</section>
  <section className="movement-feed-panel"><div className="movement-feed-tools"><div><h2>{scope==='recent'?'Andamentos recentes':'Histórico monitorado'}</h2><p>{scope==='recent'?`Movimentos com data dos últimos ${RECENT_DAYS} dias, somente de processos ativos.`:'Todo o acervo armazenado, inclusive processos encerrados.'}</p></div><div className="input-search movement-search"><Search size={19}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente, processo ou movimentação"/></div></div>{updated&&<div className="movement-last-update"><CheckCircle2 size={16}/> Atualizado às {updated.toLocaleTimeString('pt-BR')}</div>}{loading&&rows.length===0?<div className="empty">Carregando...</div>:filtered.length===0?<div className="empty">Nenhum andamento encontrado neste período.</div>:<div className="movement-timeline">{filtered.map(x=>{const c=classify(x.title||''),n=latestQueue.get(x.id),d=delivery(x,n);return <article className="movement-card" key={x.id}><div className="movement-date-rail"><span>{dateOnly(x.movement_date)}</span><i/></div><div className="movement-card-body"><div className="movement-card-top"><div><small className="movement-source">{x.source||'FONTE PROCESSUAL'}</small><h3><Gavel size={22}/>{x.title||'Movimentação processual'}</h3></div><div className="movement-badges"><span className={c.tone}>{c.label}</span><span className={`movement-status ${d.kind}`}>{d.label}</span></div></div><div className="movement-case"><User size={18}/><strong>{x.processes?.clients?.name||'Cliente não identificado'}</strong><span>·</span><span>{x.processes?.cnj_number||x.processes?.internal_number||'Processo sem número'}</span></div>{x.description&&<div className="movement-block"><span><FileText size={17}/> O QUE A FONTE REGISTROU</span><p>{x.description}</p></div>}{(n?.message_text||x.client_message)&&<div className="movement-block ai"><span><Bot size={17}/> MENSAGEM AO CLIENTE</span><p>{n?.message_text||x.client_message}</p></div>}<div className="movement-card-footer"><strong className={`movement-status ${d.kind}`}>{d.label}</strong><span>{d.detail}</span><span><Clock3 size={15}/>Movimento: {dt(x.movement_date)}</span><span><Clock3 size={15}/>Capturado: {dt(x.created_at)}</span></div></div></article>})}</div>}</section>
 </div>
}
