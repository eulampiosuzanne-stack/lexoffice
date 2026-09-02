import { useEffect,useMemo,useState } from 'react';
import { Activity,RefreshCw,Search,Gavel,Bot,Clock3,User,ShieldCheck,AlertTriangle,CheckCircle2,Eye,FileText,XCircle,Send } from 'lucide-react';
import { supabase } from '../lib/supabase';

const dt=(v:any)=>v?new Date(v).toLocaleString('pt-BR'):'—';
const dateOnly=(v:any)=>v?new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).replace('.','').toUpperCase():'—';
function classify(title=''){
 const t=title.toLowerCase();
 if(/pris[aã]o|liminar|tutela|senten[cç]a|extin[cç][aã]o|tr[aâ]nsito|penhora|bloqueio|leil[aã]o|audi[eê]ncia|per[ií]cia|prazo|medida protetiva/.test(t)) return {label:'IMPORTANTE',tone:'important',confidence:'CONFIANÇA MÉDIA',review:'REVISÃO NECESSÁRIA'};
 if(/conclus|decis[aã]o|despacho|intima[cç][aã]o|cita[cç][aã]o|expedi[cç][aã]o/.test(t)) return {label:'ATENÇÃO',tone:'attention',confidence:'CONFIANÇA MÉDIA',review:'REVISÃO RECOMENDADA'};
 return {label:'ROTINA',tone:'routine',confidence:'CONFIANÇA ALTA',review:'ACOMPANHAMENTO'};
}

export default function ProcessMovements(){
 const [rows,setRows]=useState<any[]>([]),[queue,setQueue]=useState<any[]>([]),[settings,setSettings]=useState<any>(null),[q,setQ]=useState(''),[loading,setLoading]=useState(true),[updated,setUpdated]=useState<Date|null>(null),[acting,setActing]=useState<string|null>(null),[notice,setNotice]=useState('');
 async function load(){
  if(!supabase)return;setLoading(true);
  const {data:{user}}=await supabase.auth.getUser();let orgId:string|null=null;
  if(user){const {data:p}=await supabase.from('profiles').select('org_id').eq('id',user.id).maybeSingle();orgId=p?.org_id||null}
  const [m,n,s]=await Promise.all([
   supabase.from('process_movements').select('id,process_id,movement_date,title,description,source,client_message,approved_for_client,sent_to_client_at,created_at,processes(cnj_number,internal_number,subject,clients(name))').order('movement_date',{ascending:false}).limit(1000),
   orgId?supabase.from('process_notification_queue').select('id,process_id,client_id,movement_id,notification_type,channel,scheduled_at,message_text,status,last_error,sent_at,clients(name),processes(cnj_number,internal_number)').eq('org_id',orgId).order('scheduled_at',{ascending:false}).limit(250):Promise.resolve({data:[]}) as any,
   orgId?supabase.from('process_notification_settings').select('*').eq('org_id',orgId).maybeSingle():Promise.resolve({data:null}) as any
  ]);
  setRows(m.data||[]);setQueue(n.data||[]);setSettings(s.data||null);setUpdated(new Date());setLoading(false)
 }
 useEffect(()=>{load();const id=window.setInterval(load,45000);const focus=()=>load();window.addEventListener('focus',focus);return()=>{clearInterval(id);window.removeEventListener('focus',focus)}},[]);
 async function decide(item:any,approved:boolean){
  if(!supabase||acting)return;
  const ok=window.confirm(approved?'Autorizar esta comunicação para envio ao cliente?':'NÃO autorizar esta comunicação? Ela será cancelada e não será enviada ao cliente.');
  if(!ok)return;
  setActing(item.id);setNotice('');
  try{
   const {error:me}=await supabase.from('process_movements').update({approved_for_client:approved}).eq('id',item.movement_id);
   if(me)throw me;
   const patch=approved?{status:'pending',last_error:null}:{status:'cancelled',last_error:'Não autorizado pela Dra. Suzanne'};
   const {error:qe}=await supabase.from('process_notification_queue').update(patch).eq('id',item.id);
   if(qe)throw qe;
   setNotice(approved?'✓ AUTORIZADO. O envio seguirá a janela programada do escritório.':'✕ NÃO AUTORIZADO. Esta comunicação foi cancelada e não será enviada.');
   await load();
  }catch(e:any){setNotice(`Erro ao registrar decisão: ${e?.message||'não foi possível concluir'}`)}finally{setActing(null)}
 }
 const filtered=useMemo(()=>rows.filter(x=>`${x.title||''} ${x.description||''} ${x.source||''} ${x.processes?.cnj_number||''} ${x.processes?.internal_number||''} ${x.processes?.clients?.name||''}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
 const reviewQueue=queue.filter(x=>x.status==='awaiting_review');
 const pendingQueue=queue.filter(x=>['pending','processing'].includes(x.status));
 const sentQueue=queue.filter(x=>x.status==='sent');
 return <div className="module movement-premium">
  <div className="page-head movement-page-head"><div><span className="movement-kicker">SF · INTELIGÊNCIA PROCESSUAL</span><h1>Movimentações Processuais</h1><p>Monitoramento real, comunicação automática para rotinas e sua decisão apenas nos casos que precisam de revisão.</p></div><button className="primary movement-refresh" onClick={load}><RefreshCw size={20}/> ATUALIZAR</button></div>
  <div className="movement-monitor-bar"><span><Activity size={19}/> MOTOR DE MONITORAMENTO</span><span className="online">● ATIVO · TELA ATUALIZA A CADA 45s</span></div>
  <div className="movement-summary-grid"><div className="movement-stat"><strong>{rows.length}</strong><span>Movimentações carregadas</span></div><div className="movement-stat movement-stat-review"><strong>{reviewQueue.length}</strong><span>PRECISAM DA SUA DECISÃO</span></div><div className="movement-stat"><strong>{pendingQueue.length}</strong><span>Autorizadas / aguardando envio</span></div><div className="movement-stat"><strong>{sentQueue.length}</strong><span>Enviadas ao cliente</span></div></div>
  <section className="movement-review-panel" aria-label="Fila de revisão"><div className="movement-section-title"><div><Eye size={24}/><div><h2>PRECISA DA SUA DECISÃO</h2><p>Leia a mensagem e escolha claramente: <b>AUTORIZAR ENVIO</b> ou <b>NÃO AUTORIZAR</b>.</p></div></div><span className="movement-safe-pill"><ShieldCheck size={17}/> PROTEÇÃO ATIVA</span></div>
   {notice&&<div className="movement-decision-notice" role="status">{notice}</div>}
   {reviewQueue.length===0?<div className="empty">Nenhuma comunicação aguardando sua decisão neste momento.</div>:<div className="movement-review-list">{reviewQueue.map(x=><article className="movement-review-item" key={x.id}><div className="movement-review-main"><strong className="movement-client-title">{x.clients?.name||'Cliente'} <span>·</span> {x.processes?.cnj_number||x.processes?.internal_number||'Processo'}</strong><small><Clock3 size={16}/>{dt(x.scheduled_at)} · WhatsApp</small>{x.message_text&&<div className="movement-message-preview"><b>MENSAGEM QUE O CLIENTE RECEBERÁ:</b><p>{x.message_text}</p></div>}{x.last_error&&<div className="movement-note"><AlertTriangle size={17}/>{x.last_error}</div>}</div><div className="movement-review-actions"><span className="movement-status review">AGUARDANDO SUA DECISÃO</span><button type="button" className="movement-decision approve" disabled={acting===x.id} onClick={()=>decide(x,true)}><CheckCircle2 size={22}/><span><b>AUTORIZAR ENVIO</b><small>Cliente poderá receber</small></span></button><button type="button" className="movement-decision reject" disabled={acting===x.id} onClick={()=>decide(x,false)}><XCircle size={22}/><span><b>NÃO AUTORIZAR</b><small>Cancelar este envio</small></span></button></div></article>)}</div>}
  </section>
  <section className="movement-feed-panel"><div className="movement-feed-tools"><div><h2>Histórico monitorado</h2><p>Movimentações capturadas das fontes processuais conectadas.</p></div><div className="input-search movement-search"><Search size={19}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente, processo ou movimentação"/></div></div>
   {updated&&<div className="movement-last-update"><CheckCircle2 size={16}/> Tela atualizada às {updated.toLocaleTimeString('pt-BR')}</div>}
   {loading&&rows.length===0?<div className="empty">Carregando movimentações...</div>:<div className="movement-timeline">{filtered.length===0?<div className="empty">Nenhuma movimentação encontrada.</div>:filtered.map(x=>{const c=classify(x.title||'');return <article className="movement-card" key={x.id}>
    <div className="movement-date-rail"><span>{dateOnly(x.movement_date)}</span><i/></div>
    <div className="movement-card-body"><div className="movement-card-top"><div><small className="movement-source">{x.source||'FONTE PROCESSUAL'}</small><h3><Gavel size={22}/>{x.title||'Movimentação processual'}</h3></div><div className="movement-badges" aria-label="Classificação da movimentação"><span className={c.tone}>{c.label}</span><span>{c.confidence}</span><span>{c.review}</span></div></div>
     <div className="movement-case"><User size={18}/><strong>{x.processes?.clients?.name||'Cliente não identificado'}</strong><span>·</span><span>{x.processes?.cnj_number||x.processes?.internal_number||'Processo sem número'}</span></div>
     {x.description&&<div className="movement-block"><span><FileText size={17}/> O QUE A FONTE REGISTROU</span><p>{x.description}</p></div>}
     {x.client_message&&<div className="movement-block ai"><span><Bot size={17}/> COMUNICAÇÃO PREPARADA</span><p>{x.client_message}</p></div>}
     <div className="movement-card-footer"><span><Clock3 size={15}/>{dt(x.movement_date)}</span>{x.sent_to_client_at?<span className="sent"><CheckCircle2 size={15}/> ENVIADO AO CLIENTE em {dt(x.sent_to_client_at)}</span>:x.approved_for_client===true?<span className="authorized"><Send size={15}/> AUTORIZADO PARA ENVIO</span>:x.approved_for_client===false?<span className="blocked"><XCircle size={15}/> NÃO AUTORIZADO</span>:<span className="held"><ShieldCheck size={15}/> Aguardando regra de envio</span>}</div>
    </div>
   </article>})}</div>}
  </section>
 </div>
}
