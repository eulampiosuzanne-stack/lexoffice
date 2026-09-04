import { useEffect,useState } from 'react';
import { Clipboard,Link2,X,CheckCircle2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const PROD_ORIGIN='https://lexoffice-ashy.vercel.app';
export default function ClientFormShareAction(){
 const location=useLocation();
 const [signed,setSigned]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[url,setUrl]=useState(''),[expires,setExpires]=useState(''),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const onClients=location.pathname==='/clientes'||location.pathname.startsWith('/clientes/');
 useEffect(()=>{let active=true;supabase.auth.getSession().then(({data})=>{if(active)setSigned(Boolean(data.session))});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{if(active)setSigned(Boolean(s))});return()=>{active=false;subscription.unsubscribe()}},[]);
 if(!onClients||!signed)return null;
 async function generate(){setBusy(true);setError('');setCopied(false);try{const {data,error}=await supabase.functions.invoke('client-intake-link-create',{body:{}});if(error)throw error;if(!data?.token)throw new Error(data?.error||'Não foi possível gerar o link.');const origin=window.location.hostname==='localhost'?PROD_ORIGIN:window.location.origin;setUrl(`${origin}/formulario-cliente/${encodeURIComponent(data.token)}`);setExpires(data.expires_at||'');setOpen(true)}catch(e:any){setError(e?.message||'Não foi possível gerar o link.');setOpen(true)}finally{setBusy(false)}}
 async function copy(){if(!url)return;await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),2200)}
 return <>
  <button className="client-share-trigger" type="button" onClick={generate} disabled={busy}><Link2 size={16}/>{busy?'Gerando link...':'Compartilhar formulário'}</button>
  {open&&<div className="client-share-overlay" onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="client-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-client-title"><button className="client-share-close" onClick={()=>setOpen(false)} aria-label="Fechar"><X size={18}/></button><h2 id="share-client-title"><Link2 size={20}/> Formulário do cliente</h2>{error?<div className="client-share-error">{error}</div>:<><p>Envie este link ao cliente. Ele poderá preencher os próprios dados sem acessar o LEXOFFICE.</p><div className="client-share-url"><input readOnly value={url}/><button type="button" onClick={copy}>{copied?<CheckCircle2 size={16}/>:<Clipboard size={16}/>} {copied?'Copiado':'Copiar'}</button></div><small>Válido por 7 dias e para um único envio.{expires?` Expira em ${new Date(expires).toLocaleString('pt-BR')}.`:''}</small></>}</div></div>}
 </>;
}
