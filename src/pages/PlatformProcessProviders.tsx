import {useEffect,useState} from 'react';
import {KeyRound,ShieldCheck,CheckCircle2,AlertCircle} from 'lucide-react';
import {supabase} from '../lib/supabase';
import './integrations.css';

export default function PlatformProcessProviders(){
 const[esc,setEsc]=useState(''),[escConfigured,setEscConfigured]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 async function status(){if(!supabase)return;const {data,error}=await supabase.functions.invoke('escavador-oab-discovery',{body:{action:'status'}});if(!error&&data)setEscConfigured(!!data.configured)}
 useEffect(()=>{void status()},[]);
 async function saveEsc(e:any){e.preventDefault();if(!supabase||!esc.trim())return;setSaving(true);setNotice('');setError('');const {data,error}=await supabase.functions.invoke('escavador-oab-discovery',{body:{action:'configure',pat:esc.trim()}});setEsc('');setSaving(false);if(error||data?.error){setError(data?.error||error?.message||'Não foi possível salvar a credencial.');return}setEscConfigured(true);setNotice('Credencial do Escavador salva com segurança. A chave não será exibida novamente.')}
 return <section className="integration-panel" style={{marginTop:16}}><div className="integration-head"><div><span className="eyebrow">SOMENTE SUPER ADMIN</span><h2><ShieldCheck size={19}/> Provedores globais de consulta processual</h2><p>Configure uma única credencial da plataforma. Os clientes não verão estas chaves: cada advogado apenas informa sua própria OAB e o LEXOFFICE utiliza o provedor central no backend.</p></div></div>
 <form onSubmit={saveEsc} className="integration-form"><label className="wide">Escavador — Personal Access Token<input type="password" autoComplete="new-password" value={esc} onChange={e=>setEsc(e.target.value)} placeholder={escConfigured?'Credencial configurada — informe somente para substituir':'Cole o PAT do Escavador'}/><small>{escConfigured?'Configurado. O valor atual permanece oculto.':'Ainda não configurado.'}</small></label><button className="integration-action" disabled={saving||!esc.trim()}><KeyRound size={15}/>{saving?'Salvando...':escConfigured?'Substituir credencial':'Salvar credencial'}</button></form>
 <div className="integration-notice"><ShieldCheck size={16}/> A credencial é global da plataforma; OAB, processos e resultados continuam isolados por usuário.</div>{notice&&<div className="status-message success"><CheckCircle2 size={16}/>{notice}</div>}{error&&<div className="status-message error"><AlertCircle size={16}/>{error}</div>}
 <div style={{marginTop:18,opacity:.75}}><strong>Jusbrasil</strong><p style={{marginTop:5}}>A área está preparada para receber o segundo provedor quando o conector Jusbrasil for implementado e validado. Não solicitamos credencial antes disso.</p></div></section>
}
