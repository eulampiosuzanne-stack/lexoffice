import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Deadline = { id:string; title:string; due_at:string; status:string; completed_at:string|null; process_id:string|null };
const completed = (s:string) => /^(completed|concluido|cumprido|done)$/i.test(s || '');
export default function HomeDeadlines(){
 const [items,setItems]=useState<Deadline[]>([]);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [showAll,setShowAll]=useState(false);
 useEffect(()=>{let alive=true;(async()=>{
  if(!supabase)return;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const {data:profile}=await supabase.from('profiles').select('org_id').eq('id',user.id).maybeSingle();
  if(!profile?.org_id)return;
  const {data,error:e}=await supabase.from('process_deadlines').select('id,title,due_at,status,completed_at,process_id').eq('org_id',profile.org_id).order('due_at',{ascending:true}).limit(150);
  if(alive){if(e)setError(e.message);else setItems((data||[]) as Deadline[]);}
 })();return()=>{alive=false}},[]);
 const visible=items.filter(d=>showAll||!completed(d.status)).slice(0,showAll?30:8);
 async function toggle(d:Deadline){
  if(!supabase||busy)return;
  const was=completed(d.status);
  if(!was&&!window.confirm('Confirmar que este prazo foi efetivamente cumprido?'))return;
  setBusy(d.id);setError('');
  const update=was?{status:'pending',completed_at:null}:{status:'completed',completed_at:new Date().toISOString()};
  const {data,error:e}=await supabase.from('process_deadlines').update(update).eq('id',d.id).select('id,title,due_at,status,completed_at,process_id').single();
  if(e)setError('Não foi possível atualizar o prazo: '+e.message);
  else setItems(old=>old.map(x=>x.id===d.id?(data as Deadline):x));
  setBusy(null);
 }
 return <section className="de-block" aria-labelledby="de-prazos">
  <div className="de-title"><h2 id="de-prazos">Prazos processuais</h2><button type="button" onClick={()=>setShowAll(v=>!v)}>{showAll?'Mostrar pendentes':'Ver também cumpridos'}</button></div>
  {error&&<p role="alert" className="de-empty">{error}</p>}
  {visible.length?<ul className="de-events">{visible.map(d=><li key={d.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 4px'}}>
   <span style={{flex:1,minWidth:0}}><b style={{display:'block'}}>{d.title}</b><small>{new Date(d.due_at).toLocaleDateString('pt-BR')} · {completed(d.status)?'Cumprido':new Date(d.due_at)<new Date()?'Vencido':'Pendente'}</small></span>
   <button type="button" disabled={busy===d.id} aria-label={completed(d.status)?'Desmarcar prazo cumprido':'Marcar prazo cumprido'} onClick={()=>toggle(d)} style={{border:'1px solid currentColor',borderRadius:"var(--lx-radius-md)",padding:'7px 10px',whiteSpace:'nowrap'}}>{busy===d.id?'Salvando...':completed(d.status)?'Desmarcar':'✓ Cumprido'}</button>
  </li>)}</ul>:<p className="de-empty">Nenhum prazo pendente encontrado.</p>}
 </section>
}
