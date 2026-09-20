import {useEffect,useMemo,useState} from 'react';
import {Activity,AlertTriangle,CheckCircle2,Clock3,RefreshCw,ShieldCheck,XCircle} from 'lucide-react';
import {supabase} from '../lib/supabase';
import './integrations.css';

type Run={
 id:string;status:string;trigger_source?:string|null;started_at:string;finished_at?:string|null;
 checks?:Record<string,any>|null;actions?:any[]|null;alerts?:any[]|null;error?:string|null;attempt?:number|null;
};

const statusMeta=(run?:Run|null)=>{
 if(!run)return{label:'SEM RONDA',cls:'',icon:<Clock3 size={16}/>};
 if(run.status==='failed')return{label:'FALHA',cls:'',icon:<XCircle size={16}/>};
 if(run.status==='attention'||(run.alerts||[]).length)return{label:'ATENÇÃO',cls:'',icon:<AlertTriangle size={16}/>};
 return{label:'OPERACIONAL',cls:'ok',icon:<CheckCircle2 size={16}/>};
};
const fmt=(v?:string|null)=>v?new Date(v).toLocaleString('pt-BR'):'—';
const duration=(r?:Run|null)=>{
 if(!r?.finished_at)return r?.started_at?'Em execução':'—';
 const ms=new Date(r.finished_at).getTime()-new Date(r.started_at).getTime();
 return ms<1000?`${ms} ms`:`${(ms/1000).toFixed(1)} s`;
};

export default function ExecutiveSecretary(){
 const[runs,setRuns]=useState<Run[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){
  if(!supabase)return;setBusy(true);setError('');
  const{data:{user}}=await supabase.auth.getUser();
  if(!user){setBusy(false);return}
  const{data:p}=await supabase.from('profiles').select('org_id').eq('id',user.id).maybeSingle();
  if(!p?.org_id){setError('Organização não identificada.');setBusy(false);return}
  const{data,error:e}=await supabase.from('executive_dispatch_runs')
   .select('id,status,trigger_source,started_at,finished_at,checks,actions,alerts,error,attempt')
   .eq('org_id',p.org_id).order('started_at',{ascending:false}).limit(30);
  if(e)setError(e.message);else setRuns((data||[]) as Run[]);
  setBusy(false);
 }
 useEffect(()=>{load();const id=setInterval(load,60000);return()=>clearInterval(id)},[]);
 const last=runs[0]||null,meta=statusMeta(last);
 const next=last?.started_at?new Date(Math.ceil((new Date(last.started_at).getTime()+1)/300000)*300000):null;
 const checks=last?.checks||{},alerts=last?.alerts||[],actions=last?.actions||[];
 const requiringSuzanne=alerts.filter((a:any)=>a?.severity==='failure');
 const indicators=[
  ['WhatsApp',checks.whatsapp_connections,checks.whatsapp_connections>0],
  ['Gláucia',checks.glaucia_connected?'Conectada':'Desconectada',checks.glaucia_connected===true],
  ['Agentes ativos',checks.agents_active??checks.agents,(checks.agents_active??checks.agents)>0],
  ['Conversas aguardando',checks.unattended??0,(checks.unattended??0)===0],
  ['Conflito humano/robô',checks.human_bot_conflicts??0,(checks.human_bot_conflicts??0)===0],
  ['Mensagens com falha',checks.failed_messages??0,(checks.failed_messages??0)===0],
  ['Cobranças atrasadas',checks.overdue_collections??0,(checks.overdue_collections??0)===0],
  ['Revisão humana',checks.pending_human_reviews??0,(checks.pending_human_reviews??0)===0]
 ];
 return <><div className="page-title"><h1>Secretário Executivo</h1><p>Central de supervisão operacional da LexOffice.</p></div>
 <div className="integration-head"><div><span className="integration-pill"><ShieldCheck size={14}/> LEX EXECUTIVE DISPATCHER</span><h2>Supervisão contínua</h2><p>Ronda independente do navegador, com lock, idempotência e registro.</p></div><button className="integration-action" onClick={load} disabled={busy}><RefreshCw size={16}/>{busy?'Atualizando...':'Atualizar'}</button></div>
 {error&&<div className="integration-notice">{error}</div>}
 <div className="cards">
  <div className="card">{meta.icon}<strong>{meta.label}</strong><span>Status do Dispatcher</span></div>
  <div className="card"><Clock3 size={18}/><strong>{fmt(last?.started_at)}</strong><span>Última ronda</span></div>
  <div className="card"><Clock3 size={18}/><strong>{next?next.toLocaleString('pt-BR'):'—'}</strong><span>Próxima ronda</span></div>
  <div className="card"><Activity size={18}/><strong>{duration(last)}</strong><span>Duração</span></div>
 </div>
 <div className="integration-panel"><h3>Status da LexOffice</h3><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12,marginTop:14}}>{indicators.map(([label,value,ok])=><div className="signature-row" key={String(label)}><div><strong>{String(label)}</strong><small>{String(value??'—')}</small></div><span className={`status-dot ${ok?'ok':''}`}>{ok?'operacional':'atenção'}</span></div>)}</div></div>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>
  <div className="integration-panel"><h3>Resultado e erros</h3>{last?.error?<div className="integration-notice">{last.error}</div>:alerts.length?alerts.map((a:any,i)=><div className="signature-row" key={i}><div><strong>{a.type||'Alerta'}</strong><small>{a.count? `${a.count} ocorrência(s)`:a.message||a.name||'Requer verificação'}</small></div><span className="status-dot">{a.severity||'atenção'}</span></div>):<div className="integration-empty"><CheckCircle2 size={25}/><p>Nenhum erro na última ronda.</p></div>}</div>
  <div className="integration-panel"><h3>Ações executadas</h3>{actions.length?actions.map((a:any,i)=><div className="signature-row" key={i}><strong>{a.type||'Ação'}</strong></div>):<div className="integration-empty"><Activity size={25}/><p>Nenhuma correção automática foi necessária.</p></div>}</div>
  <div className="integration-panel"><h3>Itens que exigem Suzanne</h3>{requiringSuzanne.length?requiringSuzanne.map((a:any,i)=><div className="signature-row" key={i}><div><strong>{a.type||'Intervenção'}</strong><small>{a.count? `${a.count} ocorrência(s)`:'Ação humana necessária'}</small></div><span className="status-dot">ação</span></div>):<div className="integration-empty"><CheckCircle2 size={25}/><p>Nenhuma intervenção necessária.</p></div>}</div>
 </div>
 <div className="integration-panel"><h3>Histórico das rondas</h3><div className="signature-list">{runs.map(r=>{const m=statusMeta(r);return <div className="signature-row" key={r.id}><div><strong>{m.label} • {fmt(r.started_at)}</strong><small>ID {r.id} • {duration(r)} • tentativa {r.attempt||1}</small></div><span className={`status-dot ${m.cls}`}>{r.status}</span></div>})}</div></div></>;
}
