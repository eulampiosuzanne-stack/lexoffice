import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type CareItem={id:string;client_id:string;process_id?:string|null;event_kind:string;message:string;status:string;source_verified:boolean;created_at:string};
const statusLabel:Record<string,string>={pending_review:'Aguardando revisão',approved:'Aprovada',sent:'Enviada',rejected:'Rejeitada',blocked:'Bloqueada',failed:'Falha'};
export default function SfCareOperationalPanel({orgId}:{orgId:string}){
 const [items,setItems]=useState<CareItem[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [filter,setFilter]=useState('all');
 const refresh=useCallback(async()=>{
  if(!supabase||!orgId)return;
  setLoading(true);setError('');
  const {data,error:queryError}=await supabase.from('sf_care_outbox')
   .select('id,client_id,event_kind,message,status,source_verified,created_at')
   .eq('org_id',orgId).order('created_at',{ascending:false}).limit(100);
  if(queryError){setError('Não foi possível consultar a fila SF Care: '+queryError.message);setItems([])}
  else setItems((data||[]) as CareItem[]);
  setLoading(false);
 },[orgId]);
 useEffect(()=>{void refresh()},[refresh]);
 const filtered=filter==='all'?items:items.filter(i=>i.status===filter);
 return <section className="proc-auto-card" aria-label="Painel SF Care" style={{marginTop:18}}>
  <div className="proc-auto-title"><div><h3>SF Care | Comunicações e revisão</h3><p>Fila auditável do escritório. Este painel não dispara mensagens.</p></div>
   <button type="button" className="secondary" onClick={()=>void refresh()} disabled={loading}>{loading?'Atualizando...':'Atualizar fila'}</button></div>
  <div className="proc-kpis" style={{margin:'14px 0'}}>
   <div className="proc-kpi"><b>{items.length}</b><small>registros recentes</small></div>
   <div className="proc-kpi"><b>{items.filter(i=>i.status==='pending_review').length}</b><small>aguardando revisão</small></div>
   <div className="proc-kpi"><b>{items.filter(i=>i.status==='blocked'||i.status==='failed').length}</b><small>bloqueados ou falhos</small></div>
  </div>
  <label style={{display:'block',marginBottom:12}}>Filtrar comunicações <select value={filter} onChange={e=>setFilter(e.target.value)} style={{marginLeft:10}}>
   <option value="all">Todas</option><option value="pending_review">Aguardando revisão</option><option value="approved">Aprovadas</option><option value="sent">Enviadas</option><option value="blocked">Bloqueadas</option><option value="failed">Falhas</option><option value="rejected">Rejeitadas</option>
  </select></label>
  {error&&<p role="alert" className="alert error">{error}</p>}
  {!loading&&!error&&filtered.length===0&&<p>Nenhum registro encontrado neste filtro.</p>}
  <div style={{display:'grid',gap:10,maxHeight:480,overflowY:'auto'}}>
   {filtered.map(item=><article key={item.id} style={{padding:14,border:'1px solid #b28a4a',borderRadius:12,background:'#f8f6f0',color:'#242321'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><strong>{item.event_kind.replace(/_/g,' ')}</strong><span>{statusLabel[item.status]||item.status}</span></div>
    <p style={{whiteSpace:'pre-wrap',lineHeight:1.5,fontSize:16}}>{item.message}</p>
    <small>Cliente: {item.client_id} | Processo: {item.process_id||'Não vinculado'} | Fonte: {item.source_verified?'verificada':'não verificada'}</small>
    <small style={{display:'block'}}>Registrado em {new Date(item.created_at).toLocaleString('pt-BR')}</small>
   </article>)}
  </div>
  <p style={{marginTop:12,fontSize:14}}>Aprovação individual: disponível na ficha do cliente. Enquetes e respostas dependem da integração do webhook com a Helena.</p>
 </section>
}
