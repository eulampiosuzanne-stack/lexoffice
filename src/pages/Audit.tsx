import { useEffect, useMemo, useState } from 'react';
import { Filter, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Audit(){
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[rows,setRows]=useState<any[]>([]),[processes,setProcesses]=useState<Record<string,any>>({}),[users,setUsers]=useState<Record<string,any>>({}),[processFilter,setProcessFilter]=useState(''),[userFilter,setUserFilter]=useState('');
 async function load(){
  if(!supabase){setError('Conexão indisponível.');setLoading(false);return}
  setLoading(true);setError('');
  const {data,error}=await supabase.from('process_access_log').select('id,org_id,process_id,user_id,opened_at').order('opened_at',{ascending:false}).limit(2000);
  if(error){setError('Não foi possível abrir a auditoria. Esta tela é restrita à Dra. Suzanne.');setRows([]);setLoading(false);return}
  const result=data||[];setRows(result);
  const processIds=[...new Set(result.map(x=>x.process_id).filter(Boolean))],userIds=[...new Set(result.map(x=>x.user_id).filter(Boolean))];
  const [p,u]=await Promise.all([
   processIds.length?supabase.from('processes').select('id,cnj_number,internal_number,subject').in('id',processIds):Promise.resolve({data:[],error:null}) as any,
   userIds.length?supabase.from('profiles').select('id,name,email').in('id',userIds):Promise.resolve({data:[],error:null}) as any
  ]);
  setProcesses(Object.fromEntries((p.data||[]).map((x:any)=>[x.id,x])));
  setUsers(Object.fromEntries((u.data||[]).map((x:any)=>[x.id,x])));
  setLoading(false);
 }
 useEffect(()=>{void load()},[]);
 const filtered=useMemo(()=>{const proc=processFilter.trim().toLowerCase(),user=userFilter.trim().toLowerCase();return rows.filter(r=>{const p=processes[r.process_id]||{},u=users[r.user_id]||{};const processText=[p.cnj_number,p.internal_number,p.subject].filter(Boolean).join(' ').toLowerCase();const userText=[u.name,u.email,r.user_id].filter(Boolean).join(' ').toLowerCase();return(!proc||processText.includes(proc))&&(!user||userText.includes(user))})},[rows,processes,users,processFilter,userFilter]);
 const field={minHeight:50,width:'100%',boxSizing:'border-box',borderRadius:"var(--lx-radius-md)",padding:'10px 13px',fontSize:"var(--lx-section-size)",color: "var(--lx-text)",background: "var(--lx-surface-raised)",border: "1px solid var(--lx-border)"} as const;
 return <main style={{width:'100%',minWidth:0,margin:'0 auto',padding:'20px 16px 100px',color:"var(--lx-text)"}}>
  <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:18}}><div><h1 style={{margin:0,fontSize:"var(--lx-page-size)"}}>Auditoria de acessos</h1><p style={{fontSize:"var(--lx-section-size)",margin:'6px 0 0'}}>Registro de quem abriu cada processo e em que horário. Não guardamos o conteúdo da tela.</p></div><button className="secondary" style={{minHeight:48,fontSize:"var(--lx-section-size)"}} onClick={()=>void load()}><RefreshCw size={20}/> Atualizar</button></header>
  <div style={{background:"var(--lx-surface-raised)",border:"2px solid var(--lx-accent)",padding:15,borderRadius:"var(--lx-radius-md)",fontSize:"var(--lx-font-lg)",marginBottom:16}}><ShieldCheck size={20}/> Acesso restrito à Dra. Suzanne. Tentativas de acesso seguem protegidas pelo banco de dados.</div>
  <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:12,marginBottom:18}}><label style={{fontSize:"var(--lx-font-lg)"}}>Filtrar por processo<input style={field} value={processFilter} onChange={e=>setProcessFilter(e.target.value)} placeholder="Número CNJ, interno ou assunto"/></label><label style={{fontSize:"var(--lx-font-lg)"}}>Filtrar por pessoa<input style={field} value={userFilter} onChange={e=>setUserFilter(e.target.value)} placeholder="Nome ou e-mail"/></label></section>
  {error&&<p role="alert" style={{fontSize:"var(--lx-section-size)",background:"var(--lx-surface-raised)",padding:15,borderRadius:"var(--lx-radius-md)"}}>{error}</p>}
  {loading?<p style={{fontSize:"var(--lx-section-size)"}}>Carregando registros…</p>:!filtered.length?<p style={{fontSize:"var(--lx-section-size)",background:"var(--lx-canvas)",borderRadius:"var(--lx-radius-md)",padding:18}}>{rows.length?'Nenhum acesso corresponde aos filtros.':'Ainda não há acessos registrados.'}</p>:<div style={{display:'grid',gap:10}}>{filtered.map(r=>{const p=processes[r.process_id]||{},u=users[r.user_id]||{};return <article key={r.id} style={{background:"var(--lx-canvas)",border:"1px solid var(--lx-accent)",borderRadius:"var(--lx-radius-md)",padding:16,fontSize:"var(--lx-section-size)",lineHeight:1.55}}><strong style={{fontSize:"var(--lx-section-size)",color:"var(--lx-accent)"}}>{p.cnj_number||p.internal_number||'Processo sem número'}</strong><div>{p.subject||'Assunto não informado'}</div><div>Aberto por: {u.name||u.email||'Usuário '+String(r.user_id).slice(0,8)}</div><div>Data e hora: {new Date(r.opened_at).toLocaleString('pt-BR')}</div></article>})}</div>}
  <p style={{fontSize:"var(--lx-font-md)",color:"var(--lx-text)",marginTop:14}}><Filter size={15}/> Exibindo até 2.000 registros mais recentes.</p>
 </main>
}
