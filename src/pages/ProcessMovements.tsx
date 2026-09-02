import { useEffect,useMemo,useState } from 'react';
import { Activity,RefreshCw,Search,Gavel,Bot,Clock3,User,ShieldCheck,AlertTriangle,CheckCircle2,Eye,FileText } from 'lucide-react';
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
 const [rows,setRows]=useState<any[]>([]),[queue,setQueue]=useState<any[]>([]),[settings,setSettings]=useState<any>(null),[q,setQ]=useState(''),[loading,setLoading]=useState(true),[updated,setUpdated]=useState<Date|null>(null);
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
 const filtered=useMemo(()=>rows.filter(x=>`${x.title||''} ${x.description||''} ${x.source||''} ${x.processes?.cnj_number||''} ${x.processes?.internal_number||''} ${x.processes?.clients?.name||''}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
 const reviewQueue=queue.filter(x=>['pending','awaiting_review','ready','processing','queued'].includes(x.status));
 const sentQueue=queue.filter(x=>x.status==='sent');
 return <div className="module movement-premium">
  <div className="page-head movement-page-head"><div><span className="movement-kicker">SF · INTELIGÊNCIA PROCESSUAL</span><h1>Movimentações Processuais</h1><p>Monitoramento real, interpretação conservadora e revisão humana antes da comunicação ao cliente.</p></div><button className="primary" onClick={load}><RefreshCw size={18}/> Atualizar agora</button></div>
  <div className="movement-monitor-bar"><span><Activity size={17}/> MOTOR DE MONITORAMENTO</span><span className="online">● ATIVO · ATUALIZAÇÃO DA TELA A CADA 45s</span></div>
  <div className="movement-summary-grid"><div className="movement-stat"><strong>{rows.length}</strong><span>Movimentações carregadas</span></div><div className="movement-stat"><strong>{reviewQueue.length}</strong><span>Aguardando revisão</span></div><div className="movement-stat"><strong>{sentQueue.length}</strong><span>Enviadas ao cliente</span></div><div className="movement-stat"><strong>{settings?.proactive_updates_enabled?'ATIVA':'PAUSADA'}</strong><span>Comunicação automática</span></div></div>
  <section className="movement-review-panel" aria-label="Fila de revisão"><div className="movement-section-title"><div><Eye size={20}/><div><h2>Revisão antes do WhatsApp</h2><p>O monitor continua funcionando. O envio ao cliente permanece controlado.</p></div></div><span className="movement-safe-pill"><ShieldCheck size={15}/> MODO SEGURO</span></div>
   {reviewQueue.length===0?<div className="empty">Nenhuma comunicação aguardando revisão neste momento.</div>:<div className="movement-review-list">{reviewQueue.map(x=><article className="movement-review-item" key={x.id}><div className="movement-review-main"><strong>{x.clients?.name||'Cliente'} <span>·</span> {x.processes?.cnj_number||x.processes?.internal_number||'Processo'}</strong><small><Clock3 size={13}/>{dt(x.scheduled_at)} · {x.channel}</small>{x.message_text&&<p>{x.message_text}</p>}{x.last_error&&<div className="movement-note"><AlertTriangle size={14}/>{x.last_error}</div>}</div><span className={`movement-status ${x.status==='awaiting_review'?'review':''}`}>{x.status==='awaiting_review'?'REVISÃO':x.status.toUpperCase()}</span></article>)}</div>}
  </section>
  <section className="movement-feed-panel"><div className="movement-feed-tools"><div><h2>Histórico monitorado</h2><p>Movimentações capturadas das fontes processuais conectadas.</p></div><div className="input-search movement-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente, processo ou movimentação"/></div></div>
   {updated&&<div className="movement-last-update"><CheckCircle2 size={14}/> Tela atualizada às {updated.toLocaleTimeString('pt-BR')}</div>}
   {loading&&rows.length===0?<div className="empty">Carregando movimentações...</div>:<div className="movement-timeline">{filtered.length===0?<div className="empty">Nenhuma movimentação encontrada.</div>:filtered.map(x=>{const c=classify(x.title||'');return <article className="movement-card" key={x.id}>
    <div className="movement-date-rail"><span>{dateOnly(x.movement_date)}</span><i/></div>
    <div className="movement-card-body"><div className="movement-card-top"><div><small className="movement-source">{x.source||'FONTE PROCESSUAL'}</small><h3><Gavel size={19}/>{x.title||'Movimentação processual'}</h3></div><div className="movement-badges"><span className={c.tone}>{c.label}</span><span>{c.confidence}</span><span>{c.review}</span></div></div>
     <div className="movement-case"><User size={15}/><strong>{x.processes?.clients?.name||'Cliente não identificado'}</strong><span>·</span><span>{x.processes?.cnj_number||x.processes?.internal_number||'Processo sem número'}</span></div>
     {x.description&&<div className="movement-block"><span><FileText size={15}/> O QUE A FONTE REGISTROU</span><p>{x.description}</p></div>}
     {x.client_message&&<div className="movement-block ai"><span><Bot size={15}/> COMUNICAÇÃO PREPARADA</span><p>{x.client_message}</p></div>}
     <div className="movement-card-footer"><span><Clock3 size={13}/>{dt(x.movement_date)}</span>{x.sent_to_client_at?<span className="sent"><CheckCircle2 size={13}/> Enviado ao cliente em {dt(x.sent_to_client_at)}</span>:<span className="held"><ShieldCheck size={13}/> Sem envio automático</span>}</div>
    </div>
   </article>})}</div>}
  </section>
 </div>
}
