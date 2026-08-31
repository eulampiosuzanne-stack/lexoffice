import { useEffect,useMemo,useState } from 'react';
import { Activity,RefreshCw,Search,Gavel,Bot,Clock3,User,ExternalLink,Send,ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

const dt=(v:any)=>v?new Date(v).toLocaleString('pt-BR'):'—';
export default function ProcessMovements(){
 const [rows,setRows]=useState<any[]>([]),[queue,setQueue]=useState<any[]>([]),[settings,setSettings]=useState<any>(null),[q,setQ]=useState(''),[loading,setLoading]=useState(true),[updated,setUpdated]=useState<Date|null>(null);
 async function load(){
  if(!supabase)return;setLoading(true);
  const {data:{user}}=await supabase.auth.getUser();let orgId:string|null=null;
  if(user){const {data:p}=await supabase.from('profiles').select('org_id').eq('id',user.id).maybeSingle();orgId=p?.org_id||null}
  const [m,n,s]=await Promise.all([
   supabase.from('process_movements').select('id,process_id,movement_date,title,description,source,client_message,approved_for_client,sent_to_client_at,processes(cnj_number,internal_number,subject,clients(name))').order('movement_date',{ascending:false}).limit(1000),
   orgId?supabase.from('process_notification_queue').select('id,process_id,client_id,movement_id,notification_type,channel,scheduled_at,message_text,status,last_error,sent_at,clients(name),processes(cnj_number,internal_number)').eq('org_id',orgId).order('scheduled_at',{ascending:false}).limit(250):Promise.resolve({data:[]}) as any,
   orgId?supabase.from('process_notification_settings').select('*').eq('org_id',orgId).maybeSingle():Promise.resolve({data:null}) as any
  ]);
  setRows(m.data||[]);setQueue(n.data||[]);setSettings(s.data||null);setUpdated(new Date());setLoading(false)
 }
 useEffect(()=>{load();const id=window.setInterval(load,45000);const focus=()=>load();window.addEventListener('focus',focus);return()=>{clearInterval(id);window.removeEventListener('focus',focus)}},[]);
 const filtered=useMemo(()=>rows.filter(x=>`${x.title||''} ${x.description||''} ${x.source||''} ${x.processes?.cnj_number||''} ${x.processes?.internal_number||''} ${x.processes?.clients?.name||''}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
 const openQueue=queue.filter(x=>['pending','awaiting_review','ready','processing','queued'].includes(x.status));
 const sentQueue=queue.filter(x=>x.status==='sent');
 return <div className="module"><div className="page-head"><div><h1>Andamentos</h1><p>Andamentos processuais e comunicação automática aos clientes.</p></div><button className="primary" onClick={load}><RefreshCw size={15}/> Atualizar agora</button></div>
 <div className="system-bar"><span><Activity size={14}/> MONITORAMENTO PROCESSUAL</span><span className="online">● ATUALIZAÇÃO AUTOMÁTICA · 45s</span></div>
 <div className="cards"><div className="card"><strong>{rows.length}</strong><span>Andamentos carregados</span></div><div className="card"><strong>{openQueue.length}</strong><span>Envios agendados</span></div><div className="card"><strong>{sentQueue.length}</strong><span>Enviados ao cliente</span></div><div className="card"><strong>{settings?.proactive_updates_enabled?'ATIVA':'PAUSADA'}</strong><span>Comunicação automática</span></div></div>
 <div className="integration-panel"><h3><Send size={17}/> Agendamento de envio ao cliente</h3>{settings?.proactive_updates_enabled?<div className="integration-notice"><ShieldCheck size={15}/> Automação ativa. Novos andamentos posteriores à ativação entram aqui automaticamente. Andamentos antigos não são enviados em massa.</div>:<div className="integration-notice">A comunicação automática está desativada.</div>}{openQueue.length===0?<div className="empty">Nenhum envio aguardando neste momento. O próximo andamento novo de processo com cliente vinculado será agendado automaticamente.</div>:<div className="signature-list">{openQueue.map(x=><div className="signature-row" key={x.id}><div><strong>{x.clients?.name||'Cliente'} · {x.processes?.cnj_number||x.processes?.internal_number||'Processo'}</strong><small>{x.notification_type} · {dt(x.scheduled_at)} · {x.channel}</small>{x.message_text&&<p>{x.message_text}</p>}{x.last_error&&<small>Último erro: {x.last_error}</small>}</div><span className="status-dot">{x.status}</span></div>)}</div>}</div>
 <div className="table-panel"><div className="table-tools"><div className="input-search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar processo, cliente, andamento ou tribunal"/></div><span>{updated?`Atualizado ${updated.toLocaleTimeString('pt-BR')}`:'Atualizando...'}</span></div>{loading&&rows.length===0?<div className="empty">Carregando andamentos...</div>:<div className="signature-list process-movement-feed">{filtered.length===0?<div className="empty">Nenhum andamento encontrado.</div>:filtered.map(x=><a className="signature-row" key={x.id} href={`/processos?processo=${x.process_id}`}><div><strong><Gavel size={15}/> {x.title||'Movimentação processual'}</strong><small><Clock3 size={12}/> {dt(x.movement_date)} · {x.source||'fonte não informada'}</small><small><User size={12}/> {x.processes?.clients?.name||'Cliente não identificado'} · {x.processes?.cnj_number||x.processes?.internal_number||'Processo sem número'}</small>{x.description&&<p>{x.description}</p>}{x.client_message&&<div className="movement-ai"><Bot size={14}/><span><b>Comunicação preparada:</b> {x.client_message}</span></div>}{x.sent_to_client_at&&<small>Enviado ao cliente em {dt(x.sent_to_client_at)}</small>}</div><ExternalLink size={16}/></a>)}</div>}</div></div>
}
