import {useEffect,useMemo,useState} from 'react';
import {CircleDollarSign,Plus,RefreshCw,BellRing,CheckCircle2,Send,Trash2,WalletCards,X,FileSignature} from 'lucide-react';
import {supabase} from '../lib/supabase';
import './integrations.css';

type Entry={id:string;client_id?:string|null;process_id?:string|null;contract_id?:string|null;installment_id?:string|null;type:string;category?:string|null;description:string;amount:number;due_date?:string|null;paid_at?:string|null;status:string;created_at:string;clients?:{name:string}|null};
type Client={id:string;name:string;phone?:string|null;whatsapp?:string|null};
type Process={id:string;client_id?:string|null;cnj_number?:string|null;internal_number?:string|null;subject?:string|null};
type Contract={id:string;client_id:string;title:string;total_amount:number;payment_model:string;status:string;created_at:string;clients?:{name:string}|null};
type Schedule={id:string;schedule_type:string;scheduled_at:string;status:string;message?:string|null;financial_entry_id?:string|null;clients?:{name:string}|null};
type Payment={id:string;financial_entry_id:string;amount:number;paid_at:string;payment_method?:string|null;notes?:string|null};
type Settings={id?:string;enabled:boolean;reminder_5_days:boolean;reminder_3_days:boolean;reminder_due_day:boolean;overdue_enabled:boolean;overdue_interval_days:number;stop_when_paid:boolean;automatic_late_calculation:boolean;late_fee_percent:number;monthly_interest_percent:number;require_approval_before_first_send:boolean;preferred_send_time:string};

const defaults:Settings={enabled:false,reminder_5_days:true,reminder_3_days:true,reminder_due_day:true,overdue_enabled:true,overdue_interval_days:7,stop_when_paid:true,automatic_late_calculation:true,late_fee_percent:0,monthly_interest_percent:0,require_approval_before_first_send:true,preferred_send_time:'09:00'};
const emptyForm={launch_kind:'fee_contract',type:'income',client_id:'',process_id:'',description:'Contrato de Honorários',service_description:'',amount:'',category:'Honorários contratuais',payment_mode:'single',has_down_payment:false,down_payment_amount:'',down_payment_date:'',installments:1,first_due_date:'',due_day:''};
const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);

export default function Finance(){
 const[entries,setEntries]=useState<Entry[]>([]),[clients,setClients]=useState<Client[]>([]),[processes,setProcesses]=useState<Process[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[schedule,setSchedule]=useState<Schedule[]>([]),[payments,setPayments]=useState<Payment[]>([]),[settings,setSettings]=useState<Settings>(defaults),[orgId,setOrgId]=useState(''),[userId,setUserId]=useState(''),[form,setForm]=useState(emptyForm),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[payEntry,setPayEntry]=useState<Entry|null>(null),[payAmount,setPayAmount]=useState(''),[payMethod,setPayMethod]=useState('PIX'),[payNotes,setPayNotes]=useState('');

 async function load(){
  if(!supabase)return;
  const{data:{user}}=await supabase.auth.getUser();if(!user)return;
  setUserId(user.id);
  const{data:p}=await supabase.from('profiles').select('org_id').eq('id',user.id).single();if(!p?.org_id)return;
  setOrgId(p.org_id);
  const[{data:e},{data:s},{data:c},{data:pr},{data:fc},{data:sc},{data:py}]=await Promise.all([
   supabase.from('financial_entries').select('id,client_id,process_id,contract_id,installment_id,type,category,description,amount,due_date,paid_at,status,created_at,clients(name)').eq('org_id',p.org_id).order('due_date',{ascending:true}).limit(1000),
   supabase.from('collection_settings').select('*').eq('org_id',p.org_id).maybeSingle(),
   supabase.from('clients').select('id,name,phone,whatsapp').eq('org_id',p.org_id).order('name').limit(1500),
   supabase.from('processes').select('id,client_id,cnj_number,internal_number,subject').eq('org_id',p.org_id).order('updated_at',{ascending:false}).limit(1500),
   supabase.from('fee_contracts').select('id,client_id,title,total_amount,payment_model,status,created_at,clients(name)').eq('org_id',p.org_id).order('created_at',{ascending:false}).limit(500),
   supabase.from('collection_schedule').select('id,schedule_type,scheduled_at,status,message,financial_entry_id,clients(name)').eq('org_id',p.org_id).in('status',['pending_approval','pending','failed','awaiting_approval','ready']).order('scheduled_at',{ascending:true}).limit(300),
   supabase.from('financial_entry_payments').select('id,financial_entry_id,amount,paid_at,payment_method,notes').eq('org_id',p.org_id).order('paid_at',{ascending:false}).limit(1500)
  ]);
  setEntries((e||[]) as any);setClients((c||[]) as any);setProcesses((pr||[]) as any);setContracts((fc||[]) as any);setSchedule((sc||[]) as any);setPayments((py||[]) as any);
  if(s)setSettings({...defaults,...s,preferred_send_time:String(s.preferred_send_time||'09:00').slice(0,5)});
 }
 useEffect(()=>{load()},[]);

 const availableProcesses=useMemo(()=>form.client_id?processes.filter(p=>p.client_id===form.client_id):[],[processes,form.client_id]);
 const paidFor=(id:string)=>payments.filter(x=>x.financial_entry_id===id).reduce((a,x)=>a+Number(x.amount||0),0);
 const balanceFor=(e:Entry)=>Math.max(0,Number(e.amount||0)-paidFor(e.id));
 const totals=useMemo(()=>entries.reduce((a,e)=>{const v=Number(e.amount)||0,p=paidFor(e.id),bal=Math.max(0,v-p);if(e.type==='income'){a.receivable+=bal;a.paid+=p}else a.payable+=bal;return a},{receivable:0,payable:0,paid:0}),[entries,payments]);

 async function add(){
  if(!supabase||!orgId)return;
  setNotice('');
  const total=Number(form.amount);
  if(!Number.isFinite(total)||total<=0){setNotice('Informe um valor válido.');return}
  if(!form.description.trim()){setNotice('Informe a descrição.');return}
  setBusy(true);
  try{
   if(form.launch_kind==='fee_contract'){
    if(!form.client_id)throw new Error('Selecione o cliente do contrato.');
    if(form.payment_mode==='installments'&&!form.first_due_date)throw new Error('Informe o primeiro vencimento.');
    if(form.has_down_payment){const entry=Number(form.down_payment_amount);if(!entry||entry<=0||entry>=total)throw new Error('A entrada deve ser maior que zero e menor que o valor total.');}
    const paymentModel=form.payment_mode==='single'?'cash':form.has_down_payment?'down_payment_installments':'installments';
    const{data,error}=await supabase.rpc('create_fee_contract_with_financial_entries_v2',{
     p_client_id:form.client_id,
     p_title:form.description.trim(),
     p_service_description:form.service_description.trim()||null,
     p_total_amount:total,
     p_payment_model:paymentModel,
     p_down_payment_amount:form.has_down_payment?Number(form.down_payment_amount)||0:0,
     p_down_payment_date:form.has_down_payment?(form.down_payment_date||null):null,
     p_installments_count:form.payment_mode==='single'?1:Math.max(1,Number(form.installments)||1),
     p_first_due_date:form.first_due_date||null,
     p_due_day:form.due_day?Number(form.due_day):null,
     p_process_id:form.process_id||null,
     p_notes:null
    });
    if(error)throw error;
    const count=Number((data as any)?.financial_entries_created||1);
    setNotice(`Contrato criado e integrado ao Financeiro. ${count} cobrança(s) lançada(s).`);
   }else{
    const payload={org_id:orgId,created_by:userId,client_id:form.client_id||null,process_id:form.process_id||null,type:form.type,category:form.category||null,description:form.description.trim(),amount:total,due_date:form.first_due_date||null,status:'pending'};
    const{error}=await supabase.from('financial_entries').insert(payload);if(error)throw error;
    setNotice('Lançamento financeiro criado com sucesso.');
   }
   setForm(emptyForm);await load();
  }catch(e:any){setNotice(e?.message||'Não foi possível salvar o lançamento.')}finally{setBusy(false)}
 }

 async function saveSettings(){if(!supabase||!orgId)return;setBusy(true);const payload={org_id:orgId,...settings,overdue_interval_days:Number(settings.overdue_interval_days)||7,late_fee_percent:Number(settings.late_fee_percent)||0,monthly_interest_percent:Number(settings.monthly_interest_percent)||0};delete (payload as any).id;const q=settings.id?supabase.from('collection_settings').update(payload).eq('id',settings.id):supabase.from('collection_settings').insert(payload);const{error}=await q as any;setBusy(false);if(error)setNotice(error.message);else{setNotice('Régua salva.');await load()}}
 async function approve(id:string){if(!supabase)return;const{error}=await supabase.from('collection_schedule').update({status:'pending',updated_at:new Date().toISOString()}).eq('id',id);if(error)setNotice(error.message);else await load()}
 function openPayment(e:Entry){const bal=balanceFor(e);setPayEntry(e);setPayAmount(bal.toFixed(2));setPayMethod('PIX');setPayNotes('')}
 async function registerPayment(settle=false){if(!supabase||!payEntry||!orgId)return;const bal=balanceFor(payEntry),amount=settle?bal:Number(payAmount);if(!amount||amount<=0||amount>bal+0.01){setNotice(`Informe um valor entre R$ 0,01 e ${money(bal)}.`);return}setBusy(true);const now=new Date().toISOString();const{error}=await supabase.from('financial_entry_payments').insert({org_id:orgId,financial_entry_id:payEntry.id,client_id:payEntry.client_id||null,amount,payment_method:payMethod||null,notes:payNotes||null,paid_at:now,registered_by:userId});if(!error){const newBalance=Math.max(0,bal-amount),quitado=newBalance<0.01;await supabase.from('financial_entries').update({status:quitado?'paid':'partial',paid_at:quitado?now:null,updated_at:now,notes:payNotes?`${payEntry.description} • pagamento: ${payNotes}`:undefined}).eq('id',payEntry.id);if(quitado)await supabase.from('collection_schedule').update({status:'cancelled',updated_at:now}).eq('financial_entry_id',payEntry.id).in('status',['pending','pending_approval','awaiting_approval','ready','failed'])}setBusy(false);if(error)setNotice(error.message);else{setNotice(settle?'Quitação registrada e cobranças futuras canceladas.':'Pagamento registrado. O saldo devedor foi atualizado.');setPayEntry(null);await load()}}
 async function deleteSchedule(id:string){if(!supabase||!confirm('Excluir esta cobrança programada?'))return;const{error}=await supabase.from('collection_schedule').delete().eq('id',id);if(error)setNotice(error.message);else{setNotice('Cobrança excluída.');await load()}}
 async function deleteEntry(e:Entry){if(!supabase||!confirm(`Excluir o lançamento “${e.description}”?`))return;setBusy(true);await supabase.from('collection_schedule').delete().eq('financial_entry_id',e.id);const{error}=await supabase.from('financial_entries').delete().eq('id',e.id);setBusy(false);if(error)setNotice(error.message);else{setNotice('Lançamento excluído.');await load()}}

 return <>
  <div className="page-title"><h1>Financeiro</h1><p>Contratos de honorários, receitas, despesas, pagamentos e cobrança.</p></div>
  <div className="cards"><div className="card"><strong>{money(totals.receivable)}</strong><span>A receber</span></div><div className="card"><strong>{money(totals.payable)}</strong><span>A pagar</span></div><div className="card"><strong>{money(totals.paid)}</strong><span>Recebido</span></div></div>

  <div className="integration-head"><div><span className="integration-pill"><CircleDollarSign size={14}/> FINANCEIRO</span><h2>Novo lançamento</h2></div><button className="integration-action" onClick={load}><RefreshCw size={16}/>Atualizar</button></div>
  {notice&&<div className="integration-notice">{notice}</div>}

  <div className="integration-panel"><div className="integration-form">
   <label>Natureza<select value={form.launch_kind} onChange={e=>setForm({...emptyForm,launch_kind:e.target.value,type:e.target.value==='fee_contract'?'income':'income',description:e.target.value==='fee_contract'?'Contrato de Honorários':'',category:e.target.value==='fee_contract'?'Honorários contratuais':''})}><option value="fee_contract">Contrato de honorários</option><option value="entry">Lançamento avulso</option></select></label>
   {form.launch_kind==='entry'&&<label>Tipo<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="income">Receita</option><option value="expense">Despesa</option></select></label>}
   <label>Cliente<select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value,process_id:''})}><option value="">{form.launch_kind==='fee_contract'?'Selecione o cliente':'Sem cliente'}</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Processo (opcional)<select value={form.process_id} onChange={e=>setForm({...form,process_id:e.target.value})} disabled={!form.client_id}><option value="">Sem processo específico</option>{availableProcesses.map(p=><option key={p.id} value={p.id}>{p.cnj_number||p.internal_number||p.subject||'Processo'}</option>)}</select></label>
   <label>{form.launch_kind==='fee_contract'?'Título do contrato':'Descrição'}<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
   {form.launch_kind==='fee_contract'&&<label>Serviço contratado<input value={form.service_description} onChange={e=>setForm({...form,service_description:e.target.value})} placeholder="Ex.: atuação em ação cível..."/></label>}
   {form.launch_kind==='entry'&&<label>Categoria<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label>}
   <label>Valor total<input type="number" step="0.01" min="0" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
   {form.launch_kind==='fee_contract'?<>
    <label>Forma<select value={form.payment_mode} onChange={e=>setForm({...form,payment_mode:e.target.value,has_down_payment:false})}><option value="single">À vista</option><option value="installments">Parcelado</option></select></label>
    {form.payment_mode==='single'?<label>Vencimento<input type="date" value={form.first_due_date} onChange={e=>setForm({...form,first_due_date:e.target.value})}/></label>:<>
     <label><input type="checkbox" checked={form.has_down_payment} onChange={e=>setForm({...form,has_down_payment:e.target.checked})}/> Tem entrada</label>
     {form.has_down_payment&&<><label>Valor da entrada<input type="number" step="0.01" min="0" value={form.down_payment_amount} onChange={e=>setForm({...form,down_payment_amount:e.target.value})}/></label><label>Vencimento da entrada<input type="date" value={form.down_payment_date} onChange={e=>setForm({...form,down_payment_date:e.target.value})}/></label></>}
     <label>Parcelas<input type="number" min="1" max="120" value={form.installments} onChange={e=>setForm({...form,installments:Number(e.target.value)})}/></label>
     <label>Primeiro vencimento<input type="date" value={form.first_due_date} onChange={e=>setForm({...form,first_due_date:e.target.value})}/></label>
     <label>Dia do vencimento<input type="number" min="1" max="31" value={form.due_day} onChange={e=>setForm({...form,due_day:e.target.value})}/></label>
    </>}
   </>:<label>Vencimento<input type="date" value={form.first_due_date} onChange={e=>setForm({...form,first_due_date:e.target.value})}/></label>}
   <button className="integration-action" onClick={add} disabled={busy}><Plus size={16}/>{form.launch_kind==='fee_contract'?'Criar contrato e lançar financeiro':'Adicionar lançamento'}</button>
  </div></div>

  <div className="integration-panel"><h3><FileSignature size={17}/> Contratos de honorários</h3>{contracts.length===0?<div className="integration-empty"><FileSignature size={28}/><p>Nenhum contrato financeiro cadastrado.</p></div>:<div className="signature-list">{contracts.slice(0,50).map(c=><div className="signature-row" key={c.id}><div><strong>{c.title}</strong><small>{c.clients?.name||'Cliente'} • {money(Number(c.total_amount))} • {c.payment_model==='cash'?'à vista':c.payment_model==='down_payment_installments'?'entrada + parcelas':'parcelado'}</small></div><div className="signature-actions"><span className="status-dot">{c.status}</span></div></div>)}</div>}</div>

  <div className="integration-panel"><h3><BellRing size={17}/> Régua de cobrança</h3><div className="integration-form"><label><input type="checkbox" checked={settings.enabled} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/> Ativar régua</label><label><input type="checkbox" checked={settings.reminder_5_days} onChange={e=>setSettings({...settings,reminder_5_days:e.target.checked})}/> 5 dias antes</label><label><input type="checkbox" checked={settings.reminder_3_days} onChange={e=>setSettings({...settings,reminder_3_days:e.target.checked})}/> 3 dias antes</label><label><input type="checkbox" checked={settings.reminder_due_day} onChange={e=>setSettings({...settings,reminder_due_day:e.target.checked})}/> No vencimento</label><label><input type="checkbox" checked={settings.overdue_enabled} onChange={e=>setSettings({...settings,overdue_enabled:e.target.checked})}/> Cobrar vencidos</label><label>Intervalo atraso (dias)<input type="number" value={settings.overdue_interval_days} onChange={e=>setSettings({...settings,overdue_interval_days:Number(e.target.value)})}/></label><label><input type="checkbox" checked={settings.stop_when_paid} onChange={e=>setSettings({...settings,stop_when_paid:e.target.checked})}/> Parar quando quitado</label><label><input type="checkbox" checked={settings.automatic_late_calculation} onChange={e=>setSettings({...settings,automatic_late_calculation:e.target.checked})}/> Calcular atraso</label><label>Multa (%)<input type="number" step="0.01" value={settings.late_fee_percent} onChange={e=>setSettings({...settings,late_fee_percent:Number(e.target.value)})}/></label><label>Juros/mês (%)<input type="number" step="0.01" value={settings.monthly_interest_percent} onChange={e=>setSettings({...settings,monthly_interest_percent:Number(e.target.value)})}/></label><label><input type="checkbox" checked={settings.require_approval_before_first_send} onChange={e=>setSettings({...settings,require_approval_before_first_send:e.target.checked})}/> Aprovar primeiro envio</label><label>Horário<input type="time" value={settings.preferred_send_time} onChange={e=>setSettings({...settings,preferred_send_time:e.target.value})}/></label><button className="integration-action" onClick={saveSettings} disabled={busy}>Salvar régua</button></div></div>

  <div className="integration-panel"><h3><Send size={17}/> Cobranças programadas</h3>{schedule.length===0?<div className="integration-empty"><BellRing size={28}/><p>Nenhuma cobrança pendente.</p></div>:<div className="signature-list">{schedule.map(s=><div className={`signature-row ${['pending_approval','awaiting_approval'].includes(s.status)?'selected':''}`} key={s.id}><div><strong>{s.clients?.name||'Cliente'} • {s.schedule_type}</strong><small>{new Date(s.scheduled_at).toLocaleString('pt-BR')} • {s.message||'Mensagem automática'}</small></div><div className="signature-actions"><span className="status-dot">{s.status}</span>{['pending_approval','awaiting_approval'].includes(s.status)&&<button className="integration-action" onClick={()=>approve(s.id)}><CheckCircle2 size={14}/>Aprovar</button>}<button className="secondary" onClick={()=>deleteSchedule(s.id)}><Trash2 size={14}/>Excluir cobrança</button></div></div>)}</div>}</div>

  <div className="integration-panel"><h3>Lançamentos e quitação</h3><div className="signature-list">{entries.map(e=>{const paid=paidFor(e.id),bal=balanceFor(e);return <div className={`signature-row ${bal<.01?'selected':''}`} key={e.id}><div><strong>{e.description}</strong><small>{e.clients?.name||'Sem cliente'} • {e.contract_id?'Contrato de honorários':e.type==='income'?'Receita':'Despesa'} • {e.due_date?new Date(`${e.due_date}T12:00:00`).toLocaleDateString('pt-BR'):'sem vencimento'}</small><small>Total {money(Number(e.amount))} • pago {money(paid)} • saldo {money(bal)}</small></div><div className="signature-actions"><span className="status-dot">{bal<.01?'quitado':e.status}</span>{e.type==='income'&&bal>.01&&<button className="secondary" onClick={()=>openPayment(e)}><WalletCards size={14}/>Pagamento / quitação</button>}<button className="secondary" onClick={()=>deleteEntry(e)} disabled={busy}><Trash2 size={14}/>Excluir</button></div></div>})}</div></div>

  {payEntry&&<div className="modal-backdrop" onMouseDown={()=>setPayEntry(null)}><div className="rule-modal" onMouseDown={e=>e.stopPropagation()}><div className="rule-head"><div><small>REGISTRAR PAGAMENTO</small><h2>{payEntry.description}</h2><p>Saldo atual: {money(balanceFor(payEntry))}</p></div><button onClick={()=>setPayEntry(null)}><X/></button></div><div className="form-grid"><label>Valor recebido<input type="number" step="0.01" min="0.01" max={balanceFor(payEntry)} value={payAmount} onChange={e=>setPayAmount(e.target.value)}/></label><label>Forma de pagamento<select value={payMethod} onChange={e=>setPayMethod(e.target.value)}><option>PIX</option><option>Transferência</option><option>Dinheiro</option><option>Cartão</option><option>Boleto</option><option>Outro</option></select></label><label className="wide">Observação<input value={payNotes} onChange={e=>setPayNotes(e.target.value)} placeholder="Referência, comprovante, acordo..."/></label></div><div className="signature-actions" style={{marginTop:18}}><button className="secondary" onClick={()=>registerPayment(false)} disabled={busy}><WalletCards size={14}/>Registrar valor pago</button><button className="primary" onClick={()=>registerPayment(true)} disabled={busy}><CheckCircle2 size={14}/>Dar quitação total</button></div></div></div>}
 </>;
}
