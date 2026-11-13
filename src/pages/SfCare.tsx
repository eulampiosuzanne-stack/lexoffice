import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {HeartHandshake,ShieldCheck,MessageSquare,ClipboardCheck} from 'lucide-react';
import {supabase} from '../lib/supabase';
import SfCareOperationalPanel from '../components/SfCareOperationalPanel';

export default function SfCare(){
 const [orgId,setOrgId]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{let live=true;(async()=>{
  if(!supabase){if(live){setError('Serviço indisponível.');setLoading(false)}return}
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(!user||authError){if(live){setError('Entre com sua conta para acessar o SF Care.');setLoading(false)}return}
  const {data:profile,error:profileError}=await supabase.from('profiles').select('org_id,role_key').eq('id',user.id).maybeSingle();
  if(!live)return;
  if(profileError||!profile?.org_id||!['owner','admin','lawyer','responsible_lawyer'].includes(profile.role_key)){setError('Acesso restrito à equipe jurídica autorizada.')}
  else setOrgId(profile.org_id);
  setLoading(false);
 })();return()=>{live=false}},[]);
 return <main style={{padding:'clamp(16px,3vw,32px)',maxWidth:1240,margin:'0 auto',color:'#242321'}}>
  <header style={{padding:'24px',borderRadius:18,background:'#f8f6f0',border:'1px solid #b28a4a'}}>
   <div style={{display:'flex',alignItems:'center',gap:14,color:'#65001f'}}><HeartHandshake size={32}/><div><h1 style={{fontSize:'clamp(26px,3vw,36px)',margin:0}}>SF Care</h1><p style={{margin:'5px 0 0',fontSize:17}}>Central de relacionamento e comunicação jurídica</p></div></div>
   <p style={{fontSize:16,lineHeight:1.6}}>Acompanhe as mensagens preparadas para seus clientes, confira a origem dos comunicados e supervisione o atendimento com segurança.</p>
  </header>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14,marginTop:18}}>
   <article style={{padding:18,border:'1px solid #e9dfc9',borderRadius:14,background:'#fff'}}><ShieldCheck color="#790026" size={23}/><h2 style={{fontSize:19}}>Revisão jurídica</h2><p>Comunicados sensíveis aguardam avaliação antes do envio.</p></article>
   <article style={{padding:18,border:'1px solid #e9dfc9',borderRadius:14,background:'#fff'}}><MessageSquare color="#790026" size={23}/><h2 style={{fontSize:19}}>Helena e atendimento</h2><p>As respostas dos clientes devem seguir pelo fluxo supervisionado da Helena.</p><Link to="/whatsapp">Abrir Caixa de Entrada</Link></article>
   <article style={{padding:18,border:'1px solid #e9dfc9',borderRadius:14,background:'#fff'}}><ClipboardCheck color="#790026" size={23}/><h2 style={{fontSize:19}}>Aprovações</h2><p>Revise individualmente as propostas na ficha do cliente.</p><Link to="/clientes">Abrir Clientes</Link></article>
  </div>
  {loading&&<p role="status">Carregando SF Care...</p>}
  {error&&<p role="alert" style={{marginTop:20,color:'#790026',fontWeight:700}}>{error}</p>}
  {orgId&&<SfCareOperationalPanel orgId={orgId}/>}
 </main>
}
