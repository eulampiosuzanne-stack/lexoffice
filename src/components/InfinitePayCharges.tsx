import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';

type Client={id:string;name:string};
type Contract={id:string;title:string|null;status:string|null};
type Entry={id:string;description:string|null;due_date:string|null;amount:number;status:string};
type Charge={id:string;method:string;environment:string;amount_cents:number;description:string;status:string;checkout_url:string|null;created_at:string;client_id:string};
const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const day=(d?:string|null)=>d?d.split('-').reverse().join('/'):'—';
const methods={pix_card:'Pix ou cartão (link único)',recurring:'Links individuais por parcela (não é débito automático)'} as const;
type Method=keyof typeof methods;
const statusLabel:Record<string,string>={homologation:'Homologação (sem link)',active:'Aguardando pagamento',paid:'Paga',failed:'Falhou',cancelled:'Cancelada'};
const steps=['Cliente','Contrato','Parcelas','Pagamento','Conferência'];

async function ctx(){
 if(!supabase)throw new Error('Conexão indisponível.');
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)throw new Error('Sessão indisponível. Entre novamente.');
 const {data:p}=await supabase.from('profiles').select('org_id').eq('id',user.id).single();
 if(!p?.org_id)throw new Error('Escritório não identificado.');
 return {org:p.org_id as string};
}

export function InfinitePayWizard({onDone}:{onDone:()=>void}){
 const [org,setOrg]=useState('');const [step,setStep]=useState(0);
 const [clients,setClients]=useState<Client[]>([]);const [clientId,setClientId]=useState('');
 const [contracts,setContracts]=useState<Contract[]>([]);const [contractId,setContractId]=useState('');
 const [paid,setPaid]=useState<Record<string,number>>({});const [entries,setEntries]=useState<Entry[]>([]);
 const [selected,setSelected]=useState<string[]>([]);const [method,setMethod]=useState<Method>('pix_card');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [result,setResult]=useState('');
 useEffect(()=>{let alive=true;(async()=>{try{const {org}=await ctx();const {data,error:e}=await supabase!.from('clients').select('id,name').eq('org_id',org).order('name').limit(1500);if(e)throw e;if(alive){setOrg(org);setClients(data||[])}}catch(e:any){if(alive)setError(e.message||'Erro ao carregar clientes.')}})();return()=>{alive=false}},[]);
 useEffect(()=>{setContracts([]);setContractId('');if(!org||!clientId)return;let alive=true;void supabase!.from('fee_contracts').select('id,title,status').eq('org_id',org).eq('client_id',clientId).order('created_at',{ascending:false}).then(({data,error:e})=>{if(!alive)return;e?setError(e.message):setContracts(data||[])});return()=>{alive=false}},[org,clientId]);
 useEffect(()=>{setEntries([]);setPaid({});setSelected([]);if(!org||!contractId)return;let alive=true;(async()=>{try{
  // Fonte: financial_entries do contrato (receitas). Saldo = valor - soma dos pagamentos do lançamento.
  const {data:en,error:e2}=await supabase!.from('financial_entries').select('id,description,due_date,amount,status').eq('org_id',org).eq('contract_id',contractId).eq('type','income').order('due_date');if(e2)throw e2;
  const ids=(en||[]).map(x=>x.id);const sums:Record<string,number>={};
  if(ids.length){const {data:pay,error:e3}=await supabase!.from('financial_entry_payments').select('financial_entry_id,amount').in('financial_entry_id',ids);if(e3)throw e3;(pay||[]).forEach(x=>{sums[x.financial_entry_id]=(sums[x.financial_entry_id]||0)+Number(x.amount)})}
  if(alive){setEntries((en||[]) as Entry[]);setPaid(sums)}}catch(e:any){if(alive)setError(e.message||'Erro ao carregar parcelas.')}})();return()=>{alive=false}},[org,contractId]);
 const balance=useCallback((en:Entry)=>Math.max(0,Math.round(Number(en.amount)*100)-Math.round((paid[en.id]||0)*100)),[paid]);
 const open=useMemo(()=>entries.filter(i=>!['paid','cancelled'].includes(i.status)&&balance(i)>=100),[entries,balance]);
 const chosen=open.filter(i=>selected.includes(i.id));const total=chosen.reduce((s,i)=>s+balance(i),0);
 const allSelected=open.length>0&&open.every(i=>selected.includes(i.id));
 const clientName=clients.find(c=>c.id===clientId)?.name||'';
 const canNext=[!!clientId,!!contractId,chosen.length>0,true,true][step];
 async function emit(){
  setBusy(true);setError('');
  try{const {data,error:e}=await supabase!.functions.invoke('infinitepay-webhook',{body:{action:'create',client_id:clientId,contract_id:contractId,entry_ids:chosen.map(i=>i.id),method,expected_total_cents:total}});
   if(e||data?.error){let msg=data?.error;if(!msg&&(e as any)?.context?.json){try{msg=(await (e as any).context.json())?.error}catch{/* sem corpo */}}throw new Error(msg||e?.message||'Falha ao emitir.')}
   setResult(data.environment==='homologation'?`Cobrança registrada em homologação (${data.charges.length}). Nenhum link foi gerado e a InfinitePay não foi chamada.`:`${data.charges.length} cobrança(s) emitida(s).`);onDone();
  }catch(e:any){setError(e.message||'Falha ao emitir.')}finally{setBusy(false)}
 }
 if(result)return <div className="collection-empty" role="status">{result}</div>;
 return <div className="infinitepay-wizard">
  <ol aria-label="Etapas" style={{display:'flex',gap:8,listStyle:'none',padding:0,margin:'0 0 12px',flexWrap:'wrap'}}>{steps.map((s,i)=><li key={s} aria-current={i===step?'step':undefined} style={{opacity:i===step?1:.55,fontWeight:i===step?700:400}}>{i+1}. {s}</li>)}</ol>
  {error&&<div className="collection-empty" role="alert">{error}</div>}
  {step===0&&<label className="collection-new-field">Cliente<select value={clientId} onChange={e=>setClientId(e.target.value)}><option value="">Selecione um cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  {step===1&&<><label className="collection-new-field">Contrato de honorários<select value={contractId} onChange={e=>setContractId(e.target.value)}><option value="">Selecione um contrato</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.title||'Contrato de honorários'} · {c.status||'sem status'}</option>)}</select></label>{!contracts.length&&<p>Nenhum contrato para este cliente.</p>}</>}
  {step===2&&<><button type="button" className="secondary" disabled={!open.length} onClick={()=>setSelected(allSelected?[]:open.map(i=>i.id))}>{allSelected?'Desmarcar todas':'Selecionar todas as parcelas em aberto'}</button>
   {!open.length&&<p>Este contrato não tem parcelas com saldo a cobrar.</p>}
   <div style={{display:'grid',gap:8,margin:'12px 0',maxHeight:280,overflowY:'auto'}}>{open.map(i=><label key={i.id} style={{display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" checked={selected.includes(i.id)} onChange={()=>setSelected(s=>s.includes(i.id)?s.filter(x=>x!==i.id):[...s,i.id])}/><span>{i.description||'Parcela'} · venc. {day(i.due_date)} · saldo {money(balance(i))}</span></label>)}</div>
   <p><strong>{chosen.length} parcela(s) · Total {money(total)}</strong></p></>}
  {step===3&&<><label className="collection-new-field">Forma de pagamento<select value={method} onChange={e=>setMethod(e.target.value as Method)}>{(Object.keys(methods) as Method[]).map(k=><option key={k} value={k}>{methods[k]}</option>)}</select></label>{method==='recurring'&&<p role="note">Esta opção cria um link para cada parcela. Não cadastra cartão nem realiza débitos automáticos mensais.</p>}</>}
  {step===4&&<dl><div><dt>Cliente</dt><dd>{clientName}</dd></div><div><dt>Parcelas</dt><dd>{chosen.map(i=>i.description||'Parcela').join('; ')}</dd></div><div><dt>Forma</dt><dd>{methods[method]}{method==='recurring'?` · ${chosen.length} link(s)`:''}</dd></div><div><dt>Total</dt><dd>{money(total)}</dd></div></dl>}
  <div style={{display:'flex',gap:8,marginTop:12}}>
   {step>0&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setError('');setStep(step-1)}}>Voltar</button>}
   {step<4?<button type="button" className="primary" disabled={!canNext} onClick={()=>{setError('');setStep(step+1)}}>Continuar</button>:<button type="button" className="primary" disabled={busy||!chosen.length} onClick={()=>void emit()}>{busy?'Emitindo…':'Emitir cobrança'}</button>}
  </div>
 </div>;
}

type Subscription={id:string;client_id:string;contract_id:string;provider_reference:string|null;plan_name:string|null;amount:number;due_day:number|null;status:string;notes:string|null};
function InfinitePaySubscriptions(){
 const [clients,setClients]=useState<Client[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[rows,setRows]=useState<Subscription[]>([]);
 const [org,setOrg]=useState(''),[clientId,setClientId]=useState(''),[contractId,setContractId]=useState('');
 const [reference,setReference]=useState(''),[amount,setAmount]=useState(''),[dueDay,setDueDay]=useState('10'),[status,setStatus]=useState('pending');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async(o:string)=>{const {data,error:e}=await supabase!.from('infinitepay_subscriptions').select('id,client_id,contract_id,provider_reference,plan_name,amount,due_day,status,notes').eq('org_id',o).order('created_at',{ascending:false});if(e)throw e;setRows((data||[]) as Subscription[])},[]);
 useEffect(()=>{let alive=true;(async()=>{try{const {org:o}=await ctx();const {data,error:e}=await supabase!.from('clients').select('id,name').eq('org_id',o).order('name');if(e)throw e;if(alive){setOrg(o);setClients(data||[]);await refresh(o)}}catch(e:any){if(alive)setError(e.message)}})();return()=>{alive=false}},[refresh]);
 useEffect(()=>{setContractId('');setContracts([]);if(!clientId||!org)return;let alive=true;void supabase!.from('fee_contracts').select('id,title,status').eq('org_id',org).eq('client_id',clientId).then(({data,error:e})=>{if(alive){if(e)setError(e.message);else setContracts(data||[])}});return()=>{alive=false}},[org,clientId]);
 async function save(){setError('');setNotice('');const value=Number(amount.replace(',','.'));if(!contractId||!Number.isFinite(value)||value<=0){setError('Selecione contrato e valor mensal válido.');return}setBusy(true);try{const {data:{user}}=await supabase!.auth.getUser();if(!user)throw Error('Sessão expirada');const {error:e}=await supabase!.from('infinitepay_subscriptions').insert({org_id:org,owner_user_id:user.id,client_id:clientId,contract_id:contractId,provider_reference:reference.trim()||null,amount:value,due_day:Number(dueDay),status});if(e)throw e;await refresh(org);setNotice('Assinatura vinculada. Nenhuma cobrança foi criada e nenhuma parcela foi baixada.');setReference('');setAmount('')}catch(e:any){setError(e.code==='23505'?'Este contrato já possui uma assinatura vinculada.':e.message)}finally{setBusy(false)}}
 async function updateStatus(id:string,next:string){setError('');const {error:e}=await supabase!.from('infinitepay_subscriptions').update({status:next,updated_at:new Date().toISOString()}).eq('id',id).eq('org_id',org);if(e)setError(e.message);else await refresh(org)}
 return <section className="collection-panel"><div className="collection-panel-head"><div><h2>Assinaturas InfinitePay vinculadas</h2><p>Controle administrativo de assinaturas criadas na InfinitePay. Situação informada manualmente; não confirma pagamento nem dá baixa automática.</p></div></div>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
 <label className="collection-new-field">Cliente<select value={clientId} onChange={e=>setClientId(e.target.value)}><option value="">Selecione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label className="collection-new-field">Contrato<select value={contractId} onChange={e=>setContractId(e.target.value)}><option value="">Selecione</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.title||'Contrato de honorários'}</option>)}</select></label>
 <label className="collection-new-field">Referência da assinatura (opcional)<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Identificador da InfinitePay"/></label>
 <label className="collection-new-field">Valor mensal (R$)<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
 <label className="collection-new-field">Dia de vencimento<input type="number" min="1" max="31" value={dueDay} onChange={e=>setDueDay(e.target.value)}/></label>
 <label className="collection-new-field">Situação informada<select value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">Aguardando autorização</option><option value="active">Ativa (informado)</option><option value="paused">Pausada</option><option value="cancelled">Cancelada</option><option value="completed">Concluída</option></select></label>
 </div><button type="button" className="primary" disabled={busy||!contractId} onClick={()=>void save()}>{busy?'Salvando…':'Vincular assinatura existente'}</button>
 {rows.length>0&&<div className="collection-table-scroll"><table><thead><tr><th>Cliente / contrato</th><th>Valor mensal</th><th>Referência</th><th>Situação manual</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{clients.find(c=>c.id===r.client_id)?.name||'Cliente'}<small>{r.contract_id}</small></td><td>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(r.amount))} · dia {r.due_day||'—'}</td><td>{r.provider_reference||'Não informada'}</td><td><select aria-label="Atualizar situação manual" value={r.status} onChange={e=>void updateStatus(r.id,e.target.value)}><option value="pending">Aguardando</option><option value="active">Ativa (informado)</option><option value="paused">Pausada</option><option value="cancelled">Cancelada</option><option value="completed">Concluída</option></select></td></tr>)}</tbody></table></div>}
 </section>
}
export function InfinitePayList({refreshKey}:{refreshKey:number}){
 const [rows,setRows]=useState<Charge[]>([]);const [names,setNames]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [busy,setBusy]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const {org}=await ctx();
  const {data,error:e}=await supabase!.from('infinitepay_charges').select('id,method,environment,amount_cents,description,status,checkout_url,created_at,client_id').eq('org_id',org).order('created_at',{ascending:false}).limit(100);if(e)throw e;
  const ids=[...new Set((data||[]).map(r=>r.client_id))];const map:Record<string,string>={};
  if(ids.length){const {data:cl}=await supabase!.from('clients').select('id,name').in('id',ids);(cl||[]).forEach(c=>{map[c.id]=c.name})}
  setRows(data||[]);setNames(map)}catch(e:any){setError(e.message||'Erro ao consultar cobranças.')}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load,refreshKey]);
 async function cancel(id:string){
  if(!window.confirm('Cancelar esta cobrança no sistema? As parcelas ficam livres para uma nova cobrança. Atenção: a InfinitePay não permite cancelar o link; se ele já foi enviado ao cliente, o pagamento por ele não dará baixa.'))return;
  setBusy(id);setError('');
  try{const {data,error:e}=await supabase!.functions.invoke('infinitepay-webhook',{body:{action:'cancel',charge_id:id}});if(e||data?.error)throw new Error(data?.error||e?.message||'Falha ao cancelar.');await load()}catch(e:any){setError(e.message)}finally{setBusy('')}
 }
 return <><InfinitePaySubscriptions/><section className="collection-panel"><div className="collection-panel-head"><div><h2>Cobranças InfinitePay emitidas</h2<p>Links de pagamento e situação de cada cobrança.</p></div></div>
  {error?<div className="collection-empty" role="alert">{error}</div>:loading?<div className="collection-empty" role="status">Carregando…</div>:!rows.length?<div className="collection-empty">Nenhuma cobrança InfinitePay emitida.</div>:
  <div className="collection-table-scroll"><table><thead><tr><th>Cliente / descrição</th><th>Valor</th><th>Forma</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{names[r.client_id]||'Cliente'}</strong><small>{r.description} · {new Date(r.created_at).toLocaleDateString('pt-BR')}</small></td><td className="collection-money">{money(r.amount_cents)}</td><td>{methods[r.method as Method]||r.method}</td><td>{statusLabel[r.status]||r.status}</td><td>{r.checkout_url?.startsWith('https://')&&<a href={r.checkout_url} target="_blank" rel="noopener noreferrer">Abrir link</a>}{['homologation','active'].includes(r.status)&&<button type="button" className="secondary" disabled={busy===r.id} onClick={()=>void cancel(r.id)}>{busy===r.id?'Cancelando…':'Cancelar'}</button>}</td></tr>)}</tbody></table></div>}
 </section></>;
}
