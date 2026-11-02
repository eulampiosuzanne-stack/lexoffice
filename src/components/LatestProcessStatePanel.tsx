import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
type Entry = {process_id:string;movement_date:string|null;movement_title:string|null;movement_source:string|null;needs_legal_review:boolean};
export default function LatestProcessStatePanel({orgId}:{orgId:string}) {
 const [items,setItems]=useState<Entry[]>([]); const [error,setError]=useState('');
 useEffect(()=>{if(!orgId)return;let active=true;
 const load=async()=>{const {data,error:err}=await supabase.from('process_latest_state').select('process_id,movement_date,movement_title,movement_source,needs_legal_review').eq('org_id',orgId).order('movement_date',{ascending:false}).limit(10);if(!active)return;if(err)setError('Falha ao consultar as ultimas movimentacoes.');else{setError('');setItems((data||[]) as Entry[])}};
 void load();const timer=window.setInterval(()=>void load(),120000);return()=>{active=false;window.clearInterval(timer)};
 },[orgId]);
 return <section aria-label="Ultimas movimentacoes por processo" style={{padding:20,margin:'16px 0',border:'1px solid #777',borderRadius:12,lineHeight:1.65}}>
 <h2 style={{fontSize:'1.2rem',margin:'0 0 8px'}}>Ultima movimentacao por processo</h2>
 <p style={{margin:'0 0 16px'}}>Sincronizacao na nuvem. Movimentacoes sensiveis exigem revisao juridica antes de qualquer envio.</p>
 {error&&<p role="alert">{error}</p>}
 {!error&&items.length===0&&<p>Nenhuma movimentacao consolidada.</p>}
 <div style={{display:'grid',gap:12}}>{items.map(item=><article key={item.process_id} style={{paddingTop:10,borderTop:'1px solid #777'}}>
 <Link to={'/processos?processo='+encodeURIComponent(item.process_id)} style={{fontWeight:700}}>{item.movement_title||'Movimentacao processual'}</Link>
 <div style={{fontSize:'.9rem'}}>{item.movement_date?new Date(item.movement_date).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Sem data'} | {item.movement_source||'Origem nao informada'}{item.needs_legal_review?' | Revisao juridica necessaria':''}</div>
 </article>)}</div></section>
}
