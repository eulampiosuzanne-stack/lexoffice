import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import './integrations.css';

type PaymentLink = { id:string; amount:number|null; status:string; url:string|null; created_at:string; installment_id:string|null; provider:string };
const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
export default function InfinitePay(){
 const [rows,setRows]=useState<PaymentLink[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 async function refresh(){
  setLoading(true);setError('');
  try {
   if(!supabase) throw new Error('Supabase indisponível.');
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user)throw new Error('Entre na sua conta para consultar pagamentos.');
   const {data:profile,error:profileError}=await supabase.from('profiles').select('org_id').eq('id',user.id).single();
   if(profileError||!profile?.org_id)throw new Error('Escritório não identificado.');
   const {data,error:queryError}=await supabase.from('payment_links').select('id,amount,status,url,created_at,installment_id,provider').eq('org_id',profile.org_id).eq('provider','infinitepay').order('created_at',{ascending:false}).limit(100);
   if(queryError)throw queryError;
   setRows((data||[]).filter((link:PaymentLink)=>link.provider==='infinitepay'));
  }catch(e:any){setError(e?.message||'Falha ao consultar pagamentos.')}finally{setLoading(false)}
 }
 useEffect(()=>{void refresh()},[]);
 return <main style={{maxWidth:1100,margin:'0 auto',padding:24}}>
  <div className="page-head"><div><h1>InfinitePay</h1><p>Honorários, links de cobrança e confirmação de pagamentos.</p></div></div>
  <section className="module-box"><h2>Conciliação de pagamentos</h2><p>O acompanhamento abaixo consulta somente cobranças vinculadas ao escritório. A emissão de novas cobranças está temporariamente bloqueada até a validação do serviço de checkout e da baixa automática.</p>
   <button type="button" onClick={()=>void refresh()} disabled={loading}>{loading?'Atualizando…':'Atualizar pagamentos'}</button>
   <p><Link to="/financeiro">Voltar ao Financeiro</Link></p>
  </section>
  {error&&<p role="alert">{error}</p>}
  <section className="module-box"><h2>Links de cobrança InfinitePay</h2>
   {loading?<p>Consultando…</p>:rows.length===0?<p>Nenhum link de cobrança InfinitePay registrado neste escritório.</p>:
    <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Data</th><th>Valor</th><th>Status</th><th>Cobrança</th></tr></thead><tbody>
     {rows.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleDateString('pt-BR')}</td><td>{money(Number(r.amount||0))}</td><td>{r.status==='paid'?'Confirmado no cadastro':r.status==='active'?'Aguardando confirmação':r.status}</td><td>{r.url?.startsWith('https://')?<a href={r.url} target="_blank" rel="noopener noreferrer">Abrir link</a>:'Sem link'}</td></tr>)}
    </tbody></table></div>}
  </section>
 </main>;
}
