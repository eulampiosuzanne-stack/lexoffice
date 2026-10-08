import { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

const cash=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value||0);
const stages:[string,string][]=[['novo_lead','Novo lead'],['contato_iniciado','Contato iniciado'],['qualificacao','Qualificação'],['consultoria','Consultoria'],['proposta','Proposta'],['negociacao','Negociação'],['contratado','Contratado'],['cliente','Cliente'],['perdido','Perdido']];
const closed=['completed','concluido','concluída','concluida','encerrado','closed','archived','arquivado','cancelled','canceled','cancelado'];
export default function PartnerPanel(){
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[entries,setEntries]=useState<any[]|null>(null),[leads,setLeads]=useState<any[]|null>(null),[contracts,setContracts]=useState<any[]|null>(null),[processes,setProcesses]=useState<any[]|null>(null),[clients,setClients]=useState<Record<string,string>>({});
 async function load(){
  if(!supabase){setError('A conexão com o banco não está configurada.');setLoading(false);return}
  setLoading(true);setError('');
  const [e,l,c,p]=await Promise.all([
   supabase.from('financial_entries').select('amount,status,category,type').eq('type','income').ilike('category','%honor%').in('status',['pending','overdue']).limit(5000),
   supabase.from('leads').select('id,stage_key,potential_value').limit(5000),
   supabase.from('fee_contracts').select('id,client_id,total_amount,status').in('status',['active','awaiting_success']).limit(5000),
   supabase.from('process_last_activity').select('process_id,client_id,cnj_number,internal_number,subject,status,updated_at,latest_movement_at').limit(5000)
  ]);
  setEntries(e.error?null:e.data||[]);setLeads(l.error?null:l.data||[]);setContracts(c.error?null:c.data||[]);setProcesses(p.error?null:p.data||[]);
  const failed=[e.error&&'honorários',l.error&&'leads',c.error&&'contratos',p.error&&'processos'].filter(Boolean);
  setError(failed.length?'Alguns dados não puderam ser carregados: '+failed.join(', ')+'. Confira suas permissões e tente atualizar.':'');
  if(!c.error&&c.data?.length){const ids=[...new Set(c.data.map((x:any)=>x.client_id).filter(Boolean))];if(ids.length){const {data}=await supabase.from('clients').select('id,name').in('id',ids);setClients(Object.fromEntries((data||[]).map((x:any)=>[x.id,x.name])))}}
  if(!p.error&&p.data?.length){const ids=[...new Set(p.data.map((x:any)=>x.client_id).filter(Boolean))];if(ids.length){const {data}=await supabase.from('clients').select('id,name').in('id',ids);setClients(prev=>({...prev,...Object.fromEntries((data||[]).map((x:any)=>[x.id,x.name]))}))}}
  setLoading(false);
 }
 useEffect(()=>{void load()},[]);
 const receivable=useMemo(()=>entries?.reduce((sum,x)=>sum+(Number(x.amount)||0),0)??null,[entries]);
 const stageCounts=useMemo(()=>{if(!leads)return[];const known=stages.map(([key,label])=>({key,label,count:leads.filter(x=>x.stage_key===key).length}));const other=[...new Set(leads.map(x=>x.stage_key||'sem_etapa'))].filter(key=>!stages.some(([k])=>k===key)).map(key=>({key,label:key==='sem_etapa'?'Sem etapa':key.replace(/_/g,' '),count:leads.filter(x=>(x.stage_key||'sem_etapa')===key).length}));return [...known,...other]},[leads]);
 const topClients=useMemo(()=>{if(!contracts)return[];const sums=new Map<string,number>();contracts.forEach(x=>{if(x.client_id)sums.set(x.client_id,(sums.get(x.client_id)||0)+(Number(x.total_amount)||0))});return [...sums].map(([id,total])=>({id,total,name:clients[id]||'Cliente sem nome carregado'})).sort((a,b)=>b.total-a.total).slice(0,5)},[contracts,clients]);
 const stale=useMemo(()=>{if(!processes)return[];const cutoff=Date.now()-30*24*60*60*1000;return processes.filter(x=>!closed.includes(String(x.status||'').toLowerCase())).map(x=>({...x,last:x.latest_movement_at||x.updated_at})).filter(x=>!x.last||new Date(x.last).getTime()<cutoff).sort((a,b)=>new Date(a.last||0).getTime()-new Date(b.last||0).getTime())},[processes]);
 const card={background:'#151515',border:'1px solid #9a7837',borderRadius:14,padding:18,color:'#fff'} as const;
 const heading={fontSize:21,color:'#e7c56a',margin:'0 0 14px'} as const;
 if(loading)return <div style={{padding:24,color:'#fff',fontSize:20}}>Carregando o Painel…</div>;
 return <main style={{maxWidth:1120,margin:'0 auto',padding:'20px 16px 100px',color:'#fff'}}>
  <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:20}}><div><h1 style={{fontSize:30,margin:0}}>Painel da sócia</h1><p style={{fontSize:17,margin:'6px 0 0'}}>Visão financeira e operacional com os dados cadastrados no LEXOFFICE.</p></div><button className="secondary" style={{minHeight:48,fontSize:17}} onClick={()=>void load()}><RefreshCw size={20}/> Atualizar</button></header>
  {error&&<p role="alert" style={{...card,borderColor:'#9f5757',fontSize:17}}>{error}</p>}
  <section style={{...card,marginBottom:16}}><h2 style={heading}>Honorários a receber</h2><strong style={{fontSize:30}}>{receivable===null?'Dados indisponíveis':cash(receivable)}</strong><p style={{fontSize:16,marginBottom:0}}>{entries===null?'Não foi possível consultar lançamentos.':entries.length+' lançamentos pendentes ou vencidos em categorias de honorários.'}</p></section>
  <section style={{...card,marginBottom:16}}><h2 style={heading}>Funil de leads por etapa</h2>{leads===null?<p style={{fontSize:17}}>Dados indisponíveis para sua conta.</p>:!leads.length?<p style={{fontSize:17}}>Nenhum lead cadastrado.</p>:stageCounts.map(x=><div key={x.key} style={{display:'grid',gridTemplateColumns:'minmax(120px,1fr) minmax(80px,3fr) 44px',gap:10,alignItems:'center',margin:'10px 0',fontSize:16}}><span style={{textTransform:'capitalize'}}>{x.label}</span><div style={{height:15,background:'#383838',borderRadius:10,overflow:'hidden'}}><div style={{width:(x.count?Math.max(4,(x.count/leads.length)*100):0)+'%',height:'100%',background:'#c9a44c'}}/></div><strong style={{textAlign:'right'}}>{x.count}</strong></div>)}</section>
  <section style={{...card,marginBottom:16}}><h2 style={heading}>Clientes de maior valor</h2>{contracts===null?<p style={{fontSize:17}}>Dados indisponíveis para sua conta.</p>:!topClients.length?<p style={{fontSize:17}}>Não há contratos ativos com cliente associado.</p>:<ol style={{fontSize:18,lineHeight:1.8,paddingLeft:24}}>{topClients.map(c=><li key={c.id}><strong>{c.name}</strong> — {cash(c.total)} em contratos ativos</li>)}</ol>}<small style={{fontSize:14,color:'#ddd'}}>Ordenado pelo valor total de contratos ativos cadastrados.</small></section>
  <section style={card}><h2 style={heading}>Processos sem andamento há mais de 30 dias</h2>{processes===null?<p style={{fontSize:17}}>Dados indisponíveis para sua conta.</p>:!stale.length?<p style={{fontSize:17}}>Nenhum processo em aberto aparece parado há mais de 30 dias.</p>:<div style={{display:'grid',gap:12}}>{stale.map(x=><article key={x.process_id} style={{borderTop:'1px solid #51462f',paddingTop:12}}><strong style={{fontSize:18}}>{x.cnj_number||x.internal_number||'Processo sem número'}</strong><div style={{fontSize:16,marginTop:4}}>{x.subject||'Assunto não informado'} · {clients[x.client_id]||'Cliente não identificado'}</div><div style={{fontSize:15,color:'#ddd',marginTop:4}}>{x.last?'Último andamento: '+new Date(x.last).toLocaleDateString('pt-BR'):'Nenhum andamento registrado; última atualização do processo: '+new Date(x.updated_at).toLocaleDateString('pt-BR')}</div></article>)}</div>}</section>
  <p style={{fontSize:14,color:'#ddd',marginTop:18}}><BarChart3 size={16}/> Os indicadores dependem do preenchimento correto dos dados no sistema.</p>
 </main>
}
