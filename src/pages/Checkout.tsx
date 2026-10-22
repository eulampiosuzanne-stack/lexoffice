import './Checkout.visual.css';
import { ArrowLeft, Check, CreditCard, FileText, LockKeyhole, QrCode, ShieldCheck } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type PlanKey='essencial'|'profissional'|'avancado'|'enterprise';
const plans:Record<PlanKey,{name:string;price:number;description:string}>={
  essencial:{name:'Essencial',price:149,description:'1 usuário · até 100 processos'},
  profissional:{name:'Profissional',price:299,description:'até 3 usuários · até 500 processos'},
  avancado:{name:'Avançado',price:499,description:'até 10 usuários · processos ilimitados'},
  enterprise:{name:'Enterprise',price:0,description:'Plano personalizado'}
};

export default function Checkout(){
  const params=new URLSearchParams(window.location.search);
  const selected=((params.get('plano')||'profissional') in plans?(params.get('plano')||'profissional'):'profissional') as PlanKey;
  const plan=plans[selected];
  const [method,setMethod]=useState('CARTAO');
  const [form,setForm]=useState({name:'',officeName:'',cpfCnpj:'',phone:'',email:''});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const price=useMemo(()=>plan.price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),[plan.price]);
  const change=(key:keyof typeof form)=>(e:React.ChangeEvent<HTMLInputElement>)=>setForm(v=>({...v,[key]:e.target.value}));
  const submit=async(e:FormEvent)=>{
    e.preventDefault(); setError('');
    if(selected==='enterprise'){window.location.href='mailto:contato@lexoffice.com.br?subject=LexOffice Enterprise';return;}
    if(method!=='CARTAO'){setError('Para a assinatura recorrente automática, o cartão está disponível nesta primeira integração. PIX e boleto serão habilitados na próxima etapa.');return;}
    setLoading(true);
    try{
      const {data,error:fnError}=await supabase.functions.invoke('asaas-create-checkout',{body:{plano:selected,...form}});
      if(fnError) throw fnError;
      if(!data?.checkoutUrl) throw new Error(data?.error||'Checkout não disponível.');
      window.location.href=data.checkoutUrl;
    }catch(err:any){setError(err?.message||'Não foi possível iniciar o pagamento.');setLoading(false);}
  };
  return <div className="checkout-page"><div className="checkout-shell"><header className="checkout-top"><div className="brand">⚖ LEX<span>OFFICE</span></div><a className="back" href="/planos"><ArrowLeft size={15}/> Voltar aos planos</a></header><section className="title"><h1>Finalizar contratação</h1><p>Seu escritório está a poucos passos de uma nova inteligência.</p></section><div className="grid"><form className="panel" onSubmit={submit}><h2>Dados do escritório</h2><div className="fields"><div className="field"><label>Nome completo</label><input required value={form.name} onChange={change('name')} placeholder="Responsável pela contratação"/></div><div className="field"><label>Nome do escritório</label><input required value={form.officeName} onChange={change('officeName')} placeholder="Nome profissional ou razão social"/></div><div className="field"><label>CPF ou CNPJ</label><input required value={form.cpfCnpj} onChange={change('cpfCnpj')} placeholder="CPF ou CNPJ"/></div><div className="field"><label>Telefone / WhatsApp</label><input required value={form.phone} onChange={change('phone')} placeholder="(31) 99999-9999"/></div><div className="field full"><label>E-mail de acesso</label><input required value={form.email} onChange={change('email')} type="email" placeholder="voce@escritorio.com.br"/></div></div><div className="pay-title">FORMA DE PAGAMENTO</div><div className="methods"><button type="button" className={`method ${method==='PIX'?'active':''}`} onClick={()=>setMethod('PIX')}><QrCode size={18}/> PIX</button><button type="button" className={`method ${method==='BOLETO'?'active':''}`} onClick={()=>setMethod('BOLETO')}><FileText size={18}/> Boleto</button><button type="button" className={`method ${method==='CARTAO'?'active':''}`} onClick={()=>setMethod('CARTAO')}><CreditCard size={18}/> Cartão</button></div><button className="submit" disabled={loading} type="submit">{loading?'Abrindo pagamento seguro...':'Ir para pagamento seguro'}</button>{error&&<div className="error">{error}</div>}<div className="secure"><LockKeyhole size={13}/> Pagamento processado no ambiente seguro Asaas</div></form><aside className="panel summary"><small>PLANO SELECIONADO</small><h3>{plan.name}</h3><p>{plan.description}</p><div className="price"><span>Investimento mensal</span><strong>{selected==='enterprise'?'Sob consulta':price}</strong></div><div className="items"><div><Check size={15}/> Ativação após a confirmação do pagamento</div><div><Check size={15}/> Recursos liberados conforme o plano contratado</div><div><Check size={15}/> Gestão de usuários e permissões do escritório</div><div><ShieldCheck size={15}/> Ambiente protegido e ativação automatizada</div></div><div className="provider"><strong>Pagamento seguro via Asaas</strong><br/>A credencial financeira permanece somente no backend do LexOffice.</div></aside></div></div></div>
}
