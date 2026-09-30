import { useEffect,useState } from 'react';
import { Clipboard,Link2,X,CheckCircle2,MessageCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const PROD_ORIGIN='https://lexoffice.univittagroup.com.br';
export default function ClientFormShareAction(){
 const location=useLocation();
 const [signed,setSigned]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[url,setUrl]=useState(''),[expires,setExpires]=useState(''),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const onClients=location.pathname==='/clientes'||location.pathname.startsWith('/clientes/');
 useEffect(()=>{const handler=()=>void generate();window.addEventListener('lexoffice:share-client-form',handler);return()=>window.removeEventListener('lexoffice:share-client-form',handler)},[]);
 useEffect(()=>{let active=true;supabase.auth.getSession().then(({data})=>{if(active)setSigned(Boolean(data.session))});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{if(active)setSigned(Boolean(s))});return()=>{active=false;subscription.unsubscribe()}},[]);
 if(!onClients||!signed)return null;
 async function generate(){setBusy(true);setError('');setCopied(false);try{const {data,error}=await supabase.functions.invoke('client-intake-link-create',{body:{}});if(error)throw error;if(!data?.token)throw new Error(data?.error||'Não foi possível gerar o link.');const origin=window.location.hostname==='localhost'?PROD_ORIGIN:window.location.origin;setUrl(`${origin}/formulario-cliente/${encodeURIComponent(data.token)}`);setExpires(data.expires_at||'');setOpen(true)}catch(e:any){setError(e?.message||'Não foi possível gerar o link.');setOpen(true)}finally{setBusy(false)}}
 async function copy(){if(!url)return;await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),2200)}
 function shareWhatsApp(){if(!url)return;const message=`Olá! Para darmos continuidade ao seu atendimento, preencha sua ficha de cadastro pelo link abaixo:\n\n${url}\n\nO link é individual, seguro e válido por 7 dias.`;window.open(`https://wa.me/?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer')}
 return <>
  <button className="client-share-trigger" type="button" onClick={generate} disabled={busy} aria-label="Gerar link para novo cadastro de cliente"><Link2 size={16}/>{busy?'Gerando link...':'Novo cadastro por link'}</button>
  {open&&<div className="client-share-overlay" onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="client-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-client-title"><button className="client-share-close" onClick={()=>setOpen(false)} aria-label="Fechar"><X size={18}/></button><h2 id="share-client-title"><Link2 size={20}/> Formulário do cliente</h2>{error?<div className="client-share-error">{error}</div>:<><p>Envie este link ao cliente. Ele poderá preencher os próprios dados sem acessar o LEXOFFICE.</p><div className="client-share-url"><input readOnly value={url}/><button type="button" onClick={copy}>{copied?<CheckCircle2 size={16}/>:<Clipboard size={16}/>} {copied?'Copiado':'Copiar link'}</button><button type="button" onClick={shareWhatsApp}><MessageCircle size={16}/> Enviar pelo WhatsApp</button></div><small>Válido por 7 dias e para um único envio.{expires?` Expira em ${new Date(expires).toLocaleString('pt-BR')}.`:''}</small></>}</div></div>}
 </>;
}
