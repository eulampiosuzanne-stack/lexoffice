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
 const field={minHeight:50,width:'100%',boxSizing:'border-box',borderRadius:10,padding:'10px 13px',fontSize:17,color:'#fff',background:'#111',border:'1px solid #8b6e35'} as const;
 return <main style={{maxWidth:1100,margin:'0 auto',padding:'20px 16px 100px',color:'#fff'}}>
  <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:18}}><div><h1 style={{margin:0,fontSize:30}}>Auditoria de acessos</h1><p style={{fontSize:17,margin:'6px 0 0'}}>Registro de quem abriu cada processo e em que horário. Não guardamos o conteúdo da tela.</p></div><button className="secondary" style={{minHeight:48,fontSize:17}} onClick={()=>void load()}><RefreshCw size={20}/> Atualizar</button></header>
  <div style={{background:'#241d10',border:'2px solid #c9a44c',padding:15,borderRadius:12,fontSize:16,marginBottom:16}}><ShieldCheck size={20}/> Acesso restrito à Dra. Suzanne. Tentativas de acesso seguem protegidas pelo banco de dados.</div>
  <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:12,marginBottom:18}}><label style={{fontSize:16}}>Filtrar por processo<input style={field} value={processFilter} onChange={e=>setProcessFilter(e.target.value)} placeholder="Número CNJ, interno ou assunto"/></label><label style={{fontSize:16}}>Filtrar por pessoa<input style={field} value={userFilter} onChange={e=>setUserFilter(e.target.value)} placeholder="Nome ou e-mail"/></label></section>
  {error&&<p role="alert" style={{fontSize:17,background:'#351b22',padding:15,borderRadius:12}}>{error}</p>}
  {loading?<p style={{fontSize:19}}>Carregando registros…</p>:!filtered.length?<p style={{fontSize:18,background:'#151515',borderRadius:12,padding:18}}>{rows.length?'Nenhum acesso corresponde aos filtros.':'Ainda não há acessos registrados.'}</p>:<div style={{display:'grid',gap:10}}>{filtered.map(r=>{const p=processes[r.process_id]||{},u=users[r.user_id]||{};return <article key={r.id} style={{background:'#151515',border:'1px solid #79612f',borderRadius:12,padding:16,fontSize:17,lineHeight:1.55}}><strong style={{fontSize:18,color:'#e7c56a'}}>{p.cnj_number||p.internal_number||'Processo sem número'}</strong><div>{p.subject||'Assunto não informado'}</div><div>Aberto por: {u.name||u.email||'Usuário '+String(r.user_id).slice(0,8)}</div><div>Data e hora: {new Date(r.opened_at).toLocaleString('pt-BR')}</div></article>})}</div>}
  <p style={{fontSize:14,color:'#ddd',marginTop:14}}><Filter size={15}/> Exibindo até 2.000 registros mais recentes.</p>
 </main>
}
