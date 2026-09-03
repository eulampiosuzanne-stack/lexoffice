import { useEffect,useState } from 'react';
import { ShieldCheck,ArrowLeft,AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PlatformAdmin from './PlatformAdmin';

export default function PlatformAdminEntry(){
 const[loading,setLoading]=useState(true),[allowed,setAllowed]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{(async()=>{if(!supabase){setMessage('Supabase indisponível.');setLoading(false);return}const{data:{user}}=await supabase.auth.getUser();if(!user){location.href='/';return}const{data,error}=await supabase.from('platform_admins').select('user_id,status').eq('user_id',user.id).eq('status','active').maybeSingle();if(error||!data){setMessage('Esta área é restrita ao administrador da plataforma.');setAllowed(false)}else setAllowed(true);setLoading(false)})()},[]);
 if(loading)return <div className="auth-loading">LEXOFFICE ADMIN</div>;
 if(!allowed)return <div className="legacy-auth" style={{display:'grid',placeItems:'center',minHeight:'100vh'}}><div className="legacy-card"><AlertCircle size={28}/><h2>Acesso restrito</h2><p>{message}</p><a className="legacy-enter" href="/"><ArrowLeft size={16}/> Voltar ao LEXOFFICE</a></div></div>;
 return <div className="app"><aside><div className="brand"><div className="logo">⚖</div><div><b>LEX<span>OFFICE</span></b><small>ADMINISTRAÇÃO DA PLATAFORMA</small></div></div><nav><div className="nav-group"><small>ADMIN</small><a className="active" href="/admin"><ShieldCheck size={16}/> Administração</a><a href="/"><ArrowLeft size={16}/> Voltar ao escritório</a></div></nav></aside><main><header><div className="crumb">▣ &nbsp; LEXOFFICE ADMIN</div></header><div className="content"><PlatformAdmin/></div></main></div>
}
