import { FormEvent, useEffect, useState } from 'react';

type FormState = {
  name: string; cpf_cnpj: string; rg: string; birth_date: string; marital_status: string;
  profession: string; mother_name: string; whatsapp: string; email: string; addr_street: string;
  addr_number: string; addr_district: string; addr_cep: string; addr_city: string; addr_state: string;
  area: string; notes: string;
};

const ENDPOINT='https://dcpwcuototomxoiszukt.supabase.co/functions/v1/cadastro-cliente';
const initial:FormState={name:'',cpf_cnpj:'',rg:'',birth_date:'',marital_status:'',profession:'',mother_name:'',whatsapp:'',email:'',addr_street:'',addr_number:'',addr_district:'',addr_cep:'',addr_city:'',addr_state:'',area:'',notes:''};

export default function CadastroPublico(){
  const [form,setForm]=useState<FormState>(initial);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [sent,setSent]=useState(false);

  useEffect(()=>{const icon=document.querySelector<HTMLLinkElement>('link[rel~="icon"]');const previousHref=icon?.getAttribute('href');const previousType=icon?.getAttribute('type');const link=icon||document.createElement('link');if(!icon){link.rel='icon';document.head.appendChild(link)}link.href='/sf-favicon.svg';link.type='image/svg+xml';return()=>{if(icon){if(previousHref)icon.href=previousHref;else icon.removeAttribute('href');if(previousType)icon.type=previousType;else icon.removeAttribute('type')}else link.remove()}},[]);
  function set<K extends keyof FormState>(key:K,value:FormState[K]){setForm(v=>({...v,[key]:value}))}
  async function submit(e:FormEvent){e.preventDefault();setError('');if(!form.name.trim()||!form.whatsapp.trim()){setError('Preencha pelo menos o nome completo e o WhatsApp.');return}setLoading(true);try{const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const data=await response.json().catch(()=>({}));if(!response.ok||!data?.ok)throw new Error(data?.error||'Não foi possível enviar o cadastro.');setSent(true);setForm(initial)}catch(err:any){const message=String(err?.message||'');setError(err instanceof TypeError||/fetch/i.test(message)?'Sem conexão. Verifique a internet e tente novamente.':message||'Não foi possível enviar o cadastro. Tente novamente.')}finally{setLoading(false)}}

  const page:React.CSSProperties={minHeight:'100vh',background:'radial-gradient(circle at 100% 0%,rgba(214,170,85,.08),transparent 28%),radial-gradient(circle at 0% 100%,rgba(201,153,63,.06),transparent 30%),#100C08',color:'#f4f6f8',padding:'28px 16px',fontFamily:'Inter,Segoe UI,Arial,sans-serif'};
  const shell:React.CSSProperties={maxWidth:820,margin:'0 auto',padding:'0 3px',borderRadius:20,background:'linear-gradient(90deg,#C99443 0%,#C99443 3px,transparent 3px,transparent calc(100% - 3px),#76223B calc(100% - 3px),#76223B 100%)',boxShadow:'0 24px 60px rgba(0,0,0,.4)'};
  const card:React.CSSProperties={background:'linear-gradient(145deg,#1b1510,#100c09)',borderRadius:18,padding:'30px clamp(18px,4vw,42px)',border:'1px solid rgba(201,148,67,.24)'};
  const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:'16px'};
  const label:React.CSSProperties={display:'flex',flexDirection:'column',gap:8,fontSize:16,fontWeight:600,color:'#F5F1E8'};
  const input:React.CSSProperties={width:'100%',boxSizing:'border-box',background:'#0d0b09',border:'1px solid #6E542D',borderRadius:10,padding:'14px 14px',fontSize:17,color:'#fff',outline:'none',minHeight:52};
  const section:React.CSSProperties={margin:'28px 0 15px',paddingBottom:9,borderBottom:'1px solid rgba(201,148,67,.42)',fontSize:15,fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',color:'#E8C77A'};

  if(sent)return <div style={{...page,display:'grid',placeItems:'center'}}><div style={{...shell,width:'min(620px,100%)'}}><div style={{...card,textAlign:'center',padding:'54px 28px'}}><div style={{fontSize:42,marginBottom:12}}>⚖️</div><h1 style={{color:'#fff',margin:'0 0 10px',fontSize:32}}>Cadastro enviado</h1><p style={{color:'#E7DFD0',fontSize:18,lineHeight:1.6,margin:0}}>Recebemos seus dados com sucesso. Nossa equipe fará a análise e entrará em contato pelo WhatsApp informado.</p></div></div></div>;

  return <div style={page}><div style={shell}><div style={card}>
    <header style={{textAlign:'center',marginBottom:24}}><img src="/brand/sf-monogram.png" alt="Monograma SF" width={58} height={58} style={{display:'block',objectFit:'contain',margin:'0 auto 12px'}}/><h1 style={{fontSize:'clamp(28px,5vw,36px)',color:'#fff',margin:'0 0 7px'}}>Seja bem-vindo(a)</h1><p style={{margin:0,color:'#E5DDD1',fontSize:17}}>Cadastro para atendimento jurídico</p></header>
    <div role="note" style={{background:'#261A0E',border:'1px solid #C99443',borderLeft:'5px solid #C99443',borderRadius:10,padding:'14px 16px',fontSize:17,lineHeight:1.5,fontWeight:800,color:'#FFE7AA',marginBottom:14}}>Preencha todos os campos. Os campos marcados com * são obrigatórios para envio.</div>
    <div style={{background:'#211217',borderLeft:'5px solid #76223B',borderRadius:10,padding:'14px 16px',fontSize:16,lineHeight:1.55,color:'#F5E9EC',marginBottom:22}}>Seus dados serão utilizados exclusivamente para cadastro e atendimento jurídico. Revise as informações antes de enviar.</div>
    <form onSubmit={submit}>
      <div style={section}>Dados pessoais</div><div style={grid}>
        <label style={{...label,gridColumn:'1 / -1'}}>Nome completo *<input style={input} value={form.name} onChange={e=>set('name',e.target.value)} required/></label>
        <label style={label}>CPF<input style={input} value={form.cpf_cnpj} onChange={e=>set('cpf_cnpj',e.target.value)} placeholder="000.000.000-00"/></label>
        <label style={label}>RG<input style={input} value={form.rg} onChange={e=>set('rg',e.target.value)}/></label>
        <label style={label}>Data de nascimento<input type="date" style={input} value={form.birth_date} onChange={e=>set('birth_date',e.target.value)}/></label>
        <label style={label}>Estado civil<select style={input} value={form.marital_status} onChange={e=>set('marital_status',e.target.value)}><option value="">Selecione</option><option value="single">Solteiro(a)</option><option value="married">Casado(a)</option><option value="divorced">Divorciado(a)</option><option value="widowed">Viúvo(a)</option><option value="separated">Separado(a)</option></select></label>
        <label style={label}>Profissão<input style={input} value={form.profession} onChange={e=>set('profession',e.target.value)}/></label>
        <label style={label}>Nome da mãe<input style={input} value={form.mother_name} onChange={e=>set('mother_name',e.target.value)}/></label>
      </div>
      <div style={section}>Contato</div><div style={grid}><label style={label}>WhatsApp *<input style={input} value={form.whatsapp} onChange={e=>set('whatsapp',e.target.value)} placeholder="(31) 90000-0000" required/></label><label style={label}>E-mail<input type="email" style={input} value={form.email} onChange={e=>set('email',e.target.value)}/></label></div>
      <div style={section}>Endereço completo</div><div style={grid}>
        <label style={{...label,gridColumn:'1 / -1'}}>Rua<input style={input} value={form.addr_street} onChange={e=>set('addr_street',e.target.value)}/></label><label style={label}>Número<input style={input} value={form.addr_number} onChange={e=>set('addr_number',e.target.value)}/></label><label style={label}>Bairro<input style={input} value={form.addr_district} onChange={e=>set('addr_district',e.target.value)}/></label><label style={label}>CEP<input style={input} value={form.addr_cep} onChange={e=>set('addr_cep',e.target.value)}/></label><label style={label}>Cidade<input style={input} value={form.addr_city} onChange={e=>set('addr_city',e.target.value)}/></label><label style={label}>UF<input style={input} value={form.addr_state} maxLength={2} onChange={e=>set('addr_state',e.target.value.toUpperCase())}/></label>
      </div>
      <div style={section}>Sobre o caso</div><div style={grid}><label style={{...label,gridColumn:'1 / -1'}}>Área jurídica de interesse<select style={input} value={form.area} onChange={e=>set('area',e.target.value)}><option value="">Selecione</option><option>Família</option><option>Violência doméstica</option><option>Cível</option><option>Trabalhista</option><option>Consumidor</option><option>Outro</option></select></label><label style={{...label,gridColumn:'1 / -1'}}>Descrição do caso<textarea style={{...input,minHeight:140,resize:'vertical'}} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Conte brevemente o que aconteceu e como podemos ajudar."/></label></div>
      {error&&<div role="alert" style={{marginTop:16,padding:'11px 13px',borderRadius:8,background:'rgba(201,153,63,.12)',border:'1px solid rgba(214,170,85,.6)',color:'#FFE7AA',fontSize:16}}>{error}</div>}
      <button type="submit" disabled={loading} style={{width:'100%',marginTop:24,padding:'16px 18px',minHeight:58,border:'1px solid #F2D894',borderRadius:10,background:'linear-gradient(135deg,#6E4914 0%,#A97A2B 18%,#D6AA55 38%,#F2D894 50%,#D1A04A 62%,#9E6E24 82%,#6E4914 100%)',color:'#1f1404',fontWeight:800,fontSize:18,cursor:loading?'wait':'pointer',opacity:loading?.7:1}}>{loading?'Enviando...':'Enviar cadastro'}</button>
    </form>
  </div></div></div>;
}
