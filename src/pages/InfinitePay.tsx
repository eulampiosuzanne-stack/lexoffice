import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './integrations.css';

type Client = { id: string; name: string };
type Contract = { id: string; title: string | null; status: string | null };
type Installment = { id: string; installment_number: number; due_date: string; original_amount: number; paid_amount: number | null; status: string };
type PaymentLink = { id:string; amount:number|null; status:string; url:string|null; created_at:string; installment_id:string|null; provider:string };
const money = (n:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);

export default function InfinitePay() {
 const [org,setOrg]=useState('');
 const [clients,setClients]=useState<Client[]>([]);
 const [clientId,setClientId]=useState('');
 const [contracts,setContracts]=useState<Contract[]>([]);
 const [contractId,setContractId]=useState('');
 const [installments,setInstallments]=useState<Installment[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [mode,setMode]=useState<'checkout'|'card_recurring'|'pix_automatic'|'monthly'>('checkout');
 const [rows,setRows]=useState<PaymentLink[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{let alive=true;(async()=>{
  try {
   if(!supabase) throw new Error('Supabase indisponível.');
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user) throw new Error('Entre na sua conta.');
   const {data:profile,error:profileError}=await supabase.from('profiles').select('org_id').eq('id',user.id).single();
   if(profileError||!profile?.org_id) throw new Error('Escritório não identificado.');
   const o=profile.org_id;
   const [c,l]=await Promise.all([
    supabase.from('clients').select('id,name').eq('org_id',o).order('name').limit(500),
    supabase.from('payment_links').select('id,amount,status,url,created_at,installment_id,provider').eq('org_id',o).eq('provider','infinitepay').order('created_at',{ascending:false}).limit(100)
   ]);
   if(c.error)throw c.error;if(l.error)throw l.error;
   if(alive){setOrg(o);setClients(c.data||[]);setRows(l.data||[]);}
  }catch(e:any){if(alive)setError(e?.message||'Erro ao consultar financeiro.');}
  finally{if(alive)setLoading(false);}
 })();return()=>{alive=false};},[]);
 useEffect(()=>{setContracts([]);setContractId('');setInstallments([]);setSelected([]);if(!org||!clientId||!supabase)return;
 let alive=true;void supabase.from('fee_contracts').select('id,title,status').eq('org_id',org).eq('client_id',clientId).order('id',{ascending:false}).then(({data,error})=>{if(!alive)return;if(error)setError(error.message);else setContracts(data||[]);});
 return()=>{alive=false};},[org,clientId]);
 useEffect(()=>{setInstallments([]);setSelected([]);if(!org||!clientId||!contractId||!supabase)return;
 let alive=true;void supabase.from('fee_installments').select('id,installment_number,due_date,original_amount,paid_amount,status').eq('org_id',org).eq('client_id',clientId).eq('contract_id',contractId).order('installment_number').then(({data,error})=>{if(!alive)return;if(error)setError(error.message);else setInstallments(data||[]);});
 return()=>{alive=false};},[org,clientId,contractId]);
 const pending=useMemo(()=>installments.filter(i=>i.status!=='paid'&&i.status!=='cancelled'&&Number(i.original_amount)-Number(i.paid_amount||0)>0.009),[installments]);
 const total=useMemo(()=>pending.filter(i=>selected.includes(i.id)).reduce((sum,i)=>sum+Math.max(0,Number(i.original_amount)-Number(i.paid_amount||0)),0),[pending,selected]);
 const allSelected=pending.length>0&&pending.every(i=>selected.includes(i.id));
 const toggleAll=()=>setSelected(allSelected?[]:pending.map(i=>i.id));
 const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
 const explain=()=>setNotice(mode==='pix_automatic'?'Pix Automático: aguardando documentação e credenciais da API. Nenhuma autorização será criada agora.':mode==='card_recurring'?'Cartão recorrente: a ativação pela API ainda precisa ser validada. Não será cobrado nenhum cartão.':mode==='monthly'?'Cobrança mensal: o agendamento e os lembretes dependem da implantação e dos testes do serviço. Nenhuma mensagem será enviada agora.':'Checkout InfinitePay: emissão de links ainda bloqueada até a validação de conciliação e segurança.');
 return <main style={{maxWidth:1100,margin:'0 auto',padding:24}}>
  <div className="page-head"><div><h1>Criar cobrança · InfinitePay</h1><p>Selecione o cliente, o contrato e as parcelas de honorários.</p></div></div>
  {error&&<p role="alert">{error}</p>}
  <section className="module-box">
   <h2>1. Cliente e contrato</h2>
   <label htmlFor="ip-client">Cliente</label>
   <select id="ip-client" value={clientId} onChange={e=>setClientId(e.target.value)} style={{display:'block',width:'100%',padding:12,margin:'8px 0 16px'}}>
    <option value="">Selecione um cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
   </select>
   <label htmlFor="ip-contract">Contrato de honorários</label>
   <select id="ip-contract" value={contractId} onChange={e=>setContractId(e.target.value)} disabled={!clientId} style={{display:'block',width:'100%',padding:12,margin:'8px 0 16px'}}>
    <option value="">Selecione um contrato</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.title||'Contrato de honorários'} · {c.status||'sem status'}</option>)}
   </select>
   {clientId&&!contracts.length&&<p>Nenhum contrato encontrado para este cliente.</p>}
  </section>
  <section className="module-box"><h2>2. Parcelas</h2>
   <button type="button" disabled={!pending.length} onClick={toggleAll}>{allSelected?'Desmarcar todas':'Selecionar todas as pendentes'}</button>
   {contractId&&!installments.length&&<p>Nenhuma parcela cadastrada neste contrato.</p>}
   <div style={{display:'grid',gap:10,marginTop:16}}>
    {installments.map(i=>{const balance=Math.max(0,Number(i.original_amount)-Number(i.paid_amount||0));const eligible=pending.some(p=>p.id===i.id);return <label key={i.id} style={{display:'flex',gap:12,alignItems:'center',padding:12,border:'1px solid #8885',borderRadius:8,opacity:eligible?1:.55}}>
     <input type="checkbox" disabled={!eligible} checked={selected.includes(i.id)} onChange={()=>toggle(i.id)}/>
     <span>Parcela {i.installment_number} · venc. {i.due_date?.split('-').reverse().join('/')} · saldo {money(balance)} · {i.status}</span>
    </label>})}
   </div>
   <p><strong>{selected.length} parcela(s) selecionada(s) · Total {money(total)}</strong></p>
  </section>
  <section className="module-box"><h2>3. Modalidade</h2>
   <label htmlFor="ip-mode">Forma de cobrança</label>
   <select id="ip-mode" value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setNotice('');}} style={{display:'block',width:'100%',padding:12,margin:'8px 0 16px'}}>
    <option value="checkout">Link de pagamento (Pix/cartão)</option>
    <option value="card_recurring">Cartão recorrente</option>
    <option value="monthly">Cobrança mensal automática</option>
    <option value="pix_automatic">Pix Automático (API pendente)</option>
   </select>
   <p>Prévia somente. Nenhuma cobrança, assinatura ou mensagem será criada sem integração validada e confirmação.</p>
   <button type="button" disabled={!selected.length} onClick={explain}>Conferir disponibilidade</button>
   {notice&&<p role="status">{notice}</p>}
   <p><Link to="/financeiro">Voltar ao Financeiro</Link></p>
  </section>
  <section className="module-box"><h2>Pagamentos InfinitePay</h2>
   {loading?<p>Consultando…</p>:rows.length===0?<p>Nenhum pagamento InfinitePay registrado.</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Data</th><th>Valor</th><th>Status</th><th>Link</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleDateString('pt-BR')}</td><td>{money(Number(r.amount||0))}</td><td>{r.status}</td><td>{r.url?.startsWith('https://')?<a href={r.url} target="_blank" rel="noopener noreferrer">Abrir</a>:'Indisponível'}</td></tr>)}</tbody></table></div>}
  </section>
 </main>;
}
