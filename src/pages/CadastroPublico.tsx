import { FormEvent, useState } from 'react';

type FormState = {
  name: string;
  cpf_cnpj: string;
  rg: string;
  birth_date: string;
  marital_status: string;
  profession: string;
  mother_name: string;
  whatsapp: string;
  email: string;
  addr_street: string;
  addr_number: string;
  addr_district: string;
  addr_cep: string;
  addr_city: string;
  addr_state: string;
  area: string;
  notes: string;
};

const ENDPOINT='https://dcpwcuototomxoiszukt.supabase.co/functions/v1/cadastro-cliente';

const initial:FormState={
  name:'',cpf_cnpj:'',rg:'',birth_date:'',marital_status:'',profession:'',mother_name:'',
  whatsapp:'',email:'',addr_street:'',addr_number:'',addr_district:'',addr_cep:'',addr_city:'',addr_state:'',area:'',notes:''
};

export default function CadastroPublico(){
  const [form,setForm]=useState<FormState>(initial);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [sent,setSent]=useState(false);

  function set<K extends keyof FormState>(key:K,value:FormState[K]){setForm(v=>({...v,[key]:value}))}

  async function submit(e:FormEvent){
    e.preventDefault();
    setError('');
    if(!form.name.trim()||!form.whatsapp.trim()){
      setError('Preencha pelo menos o nome completo e o WhatsApp.');
      return;
    }
    setLoading(true);
    try{
      const response=await fetch(ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(form)
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data?.ok)throw new Error(data?.error||'Não foi possível enviar o cadastro.');
      setSent(true);
      setForm(initial);
    }catch(err:any){
      setError(err?.message||'Falha de conexão. Tente novamente.');
    }finally{
      setLoading(false);
    }
  }

  const page:React.CSSProperties={minHeight:'100vh',background:'#0b0b0b',color:'#ececec',padding:'28px 16px',fontFamily:'Inter,Segoe UI,Arial,sans-serif'};
  const shell:React.CSSProperties={maxWidth:820,margin:'0 auto',padding:2,borderRadius:20,background:'linear-gradient(145deg,#f4cf78 0%,#8f1c3b 48%,#d9a441 100%)',boxShadow:'0 24px 60px rgba(0,0,0,.45)'};
  const card:React.CSSProperties={background:'#111',borderRadius:18,padding:'32px clamp(18px,4vw,42px)'};
  const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:'16px'};
  const label:React.CSSProperties={display:'flex',flexDirection:'column',gap:7,fontSize:13,color:'#d1d1d1'};
  const input:React.CSSProperties={width:'100%',boxSizing:'border-box',background:'#080808',border:'1px solid #383838',borderRadius:9,padding:'12px 13px',fontSize:15,color:'#f2f2f2',outline:'none'};
  const section:React.CSSProperties={margin:'28px 0 14px',paddingBottom:7,borderBottom:'1px solid #2c2c2c',fontSize:12,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'#e4bd66'};

  if(sent)return <div style={{...page,display:'grid',placeItems:'center'}}><div style={{...shell,width:'min(620px,100%)'}}><div style={{...card,textAlign:'center',padding:'54px 28px'}}><div style={{fontSize:42,marginBottom:12}}>⚖️</div><h1 style={{fontFamily:'Georgia,serif',color:'#f4cf78',margin:'0 0 10px'}}>Cadastro enviado</h1><p style={{color:'#bcbcbc',margin:0}}>Recebemos seus dados com sucesso. Nossa equipe fará a análise e entrará em contato pelo WhatsApp informado.</p></div></div></div>;

  return <div style={page}>
    <div style={shell}>
      <div style={card}>
        <header style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:36,marginBottom:8}}>⚖️</div>
          <h1 style={{fontFamily:'Georgia,serif',fontSize:'clamp(25px,5vw,34px)',color:'#f4cf78',margin:'0 0 6px'}}>Cadastro de Cliente</h1>
          <p style={{margin:0,color:'#aaa'}}>Preencha seus dados para agilizar o atendimento jurídico.</p>
        </header>
        <div style={{background:'#241014',border:'1px solid #6f1d35',borderRadius:10,padding:'13px 15px',fontSize:14,color:'#efd2d8',marginBottom:22}}>Seus dados serão utilizados exclusivamente para cadastro e atendimento jurídico. Revise as informações antes de enviar.</div>
        <form onSubmit={submit}>
          <div style={section}>Dados pessoais</div>
          <div style={grid}>
            <label style={{...label,gridColumn:'1 / -1'}}>Nome completo *<input style={input} value={form.name} onChange={e=>set('name',e.target.value)} required/></label>
            <label style={label}>CPF<input style={input} value={form.cpf_cnpj} onChange={e=>set('cpf_cnpj',e.target.value)} placeholder="000.000.000-00"/></label>
            <label style={label}>RG<input style={input} value={form.rg} onChange={e=>set('rg',e.target.value)}/></label>
            <label style={label}>Data de nascimento<input type="date" style={input} value={form.birth_date} onChange={e=>set('birth_date',e.target.value)}/></label>
            <label style={label}>Estado civil<select style={input} value={form.marital_status} onChange={e=>set('marital_status',e.target.value)}><option value="">Selecione</option><option value="single">Solteiro(a)</option><option value="married">Casado(a)</option><option value="divorced">Divorciado(a)</option><option value="widowed">Viúvo(a)</option><option value="separated">Separado(a)</option></select></label>
            <label style={label}>Profissão<input style={input} value={form.profession} onChange={e=>set('profession',e.target.value)}/></label>
            <label style={label}>Nome da mãe<input style={input} value={form.mother_name} onChange={e=>set('mother_name',e.target.value)}/></label>
          </div>

          <div style={section}>Contato</div>
          <div style={grid}>
            <label style={label}>WhatsApp *<input style={input} value={form.whatsapp} onChange={e=>set('whatsapp',e.target.value)} placeholder="(31) 90000-0000" required/></label>
            <label style={label}>E-mail<input type="email" style={input} value={form.email} onChange={e=>set('email',e.target.value)}/></label>
          </div>

          <div style={section}>Endereço completo</div>
          <div style={grid}>
            <label style={{...label,gridColumn:'span 2'}}>Rua<input style={input} value={form.addr_street} onChange={e=>set('addr_street',e.target.value)}/></label>
            <label style={label}>Número<input style={input} value={form.addr_number} onChange={e=>set('addr_number',e.target.value)}/></label>
            <label style={label}>Bairro<input style={input} value={form.addr_district} onChange={e=>set('addr_district',e.target.value)}/></label>
            <label style={label}>CEP<input style={input} value={form.addr_cep} onChange={e=>set('addr_cep',e.target.value)}/></label>
            <label style={label}>Cidade<input style={input} value={form.addr_city} onChange={e=>set('addr_city',e.target.value)}/></label>
            <label style={label}>UF<input style={input} value={form.addr_state} maxLength={2} onChange={e=>set('addr_state',e.target.value.toUpperCase())}/></label>
          </div>

          <div style={section}>Sobre o caso</div>
          <div style={grid}>
            <label style={{...label,gridColumn:'1 / -1'}}>Área jurídica de interesse<select style={input} value={form.area} onChange={e=>set('area',e.target.value)}><option value="">Selecione</option><option>Família</option><option>Violência doméstica</option><option>Cível</option><option>Trabalhista</option><option>Consumidor</option><option>Outro</option></select></label>
            <label style={{...label,gridColumn:'1 / -1'}}>Descrição do caso<textarea style={{...input,minHeight:120,resize:'vertical'}} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Conte brevemente o que aconteceu e como podemos ajudar."/></label>
          </div>

          {error&&<div role="alert" style={{marginTop:16,padding:'11px 13px',borderRadius:8,background:'#2b1014',border:'1px solid #7d2636',color:'#ffb2bd',fontSize:14}}>{error}</div>}
          <button type="submit" disabled={loading} style={{width:'100%',marginTop:24,padding:'15px 18px',border:0,borderRadius:10,background:'linear-gradient(145deg,#e3b756,#b27d29)',color:'#190f05',fontWeight:800,fontSize:16,cursor:loading?'wait':'pointer',opacity:loading?.7:1}}>{loading?'Enviando...':'Enviar cadastro'}</button>
        </form>
      </div>
    </div>
  </div>;
}
