import {useEffect,useState,useRef} from 'react';
import {Facebook,KeyRound,CheckCircle2,AlertTriangle} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {signupAssets,validMetaConnection,type SignupAssets} from '../lib/metaSignup';

declare global{interface Window{FB:any;fbAsyncInit?:()=>void}}
export default function MetaPartnerConnect({connectLabel='Conectar como parceiro'}:{connectLabel?:string}){
 const [status,setStatus]=useState<any>(null),[appId,setAppId]=useState(''),[appSecret,setAppSecret]=useState(''),[configId,setConfigId]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const cleanupRef=useRef<()=>void>(()=>{});
 useEffect(()=>()=>cleanupRef.current(),[]);
 async function load(){if(!supabase)return;const r=await supabase.functions.invoke('meta-whatsapp-oauth',{body:{action:'status'}});if(!r.error){setStatus(r.data);if(r.data?.app_id)setAppId(String(r.data.app_id));if(r.data?.embedded_configuration_id)setConfigId(String(r.data.embedded_configuration_id))}}
 useEffect(()=>{load()},[]);
 async function save(){if(!supabase||!appId.trim()||!appSecret.trim()||!configId.trim())return;setBusy(true);setNotice('');const r=await supabase.functions.invoke('meta-whatsapp-oauth',{body:{action:'configure_app',app_id:appId.trim(),app_secret:appSecret.trim(),configuration_id:configId.trim()}});setBusy(false);if(r.error||r.data?.error){setNotice(r.data?.error||r.error?.message||'Falha ao salvar configuração da Meta.');return}setAppSecret('');setNotice('Configuração de parceiro salva. Agora use Conectar como parceiro.');await load()}
 function sdk(){return new Promise<void>((resolve,reject)=>{if(window.FB){window.FB.init({appId,status:false,cookie:true,xfbml:false,version:'v23.0'});resolve();return}window.fbAsyncInit=()=>{window.FB.init({appId,status:false,cookie:true,xfbml:false,version:'v23.0'});resolve()};const old=document.getElementById('facebook-jssdk');if(old){setTimeout(()=>window.FB?resolve():reject(new Error('SDK da Meta não carregou.')),1200);return}const s=document.createElement('script');s.id='facebook-jssdk';s.async=true;s.defer=true;s.crossOrigin='anonymous';s.src='https://connect.facebook.net/pt_BR/sdk.js';s.onerror=()=>reject(new Error('Não foi possível carregar o SDK da Meta.'));document.body.appendChild(s)})}
 async function connectPartner(){
  if(!supabase||!appId.trim()||!configId.trim()||busy)return;
  setBusy(true);setNotice('');
  let cleanup=()=>{};
  try{
   await sdk();
   let finished=false,assets:SignupAssets|null=null,code:string|null=null,exchanging=false;
   const finish=(message:string)=>{if(finished)return;finished=true;cleanup();setBusy(false);setNotice(message)};
   const exchange=async()=>{
    if(finished||exchanging||!code||!assets)return;exchanging=true;cleanup();
    try{const r=await supabase!.functions.invoke('meta-whatsapp-oauth',{body:{action:'embedded_exchange',code,...assets}});
     if(r.error||r.data?.error||r.data?.connected!==true){finish(r.data?.error||r.error?.message||'A conexão não foi validada pela Meta.');return}
     finish('Conta e número validados pela Meta. Teste de mensagens ainda pendente.');await load();
    }catch{finish('Não foi possível validar a conexão. Tente novamente.')}
   };
   const listener=(event:MessageEvent)=>{const selected=signupAssets(event.origin,event.data);if(selected){assets=selected;void exchange()}};
   window.addEventListener('message',listener);
   const timeout=window.setTimeout(()=>finish('Cadastro não concluído: a Meta precisa devolver o código, a WABA e o identificador do número. Nenhuma conexão foi confirmada.'),180000);
   cleanup=()=>{window.removeEventListener('message',listener);window.clearTimeout(timeout)};cleanupRef.current=cleanup;
   window.FB.login((response:any)=>{code=response?.authResponse?.code||null;if(!code){finish('A Meta não devolveu o código de conexão. Verifique o cadastro ou o erro exibido no Facebook.');return}void exchange()},
    {config_id:configId.trim(),response_type:'code',override_default_response_type:true,extras:{setup:{},featureType:'whatsapp_business_app_onboarding',sessionInfoVersion:'3'}});
  }catch{cleanup();setBusy(false);setNotice('Falha ao abrir a conexão da Meta.')}
 }

 const connected=validMetaConnection(status?.connection);
 return <div className={`meta-partner-box ${connected?'connected':''}`}><div className="meta-config-title"><Facebook size={17}/><b>Conexão como parceiro — Embedded Signup</b></div><p>Fluxo indicado para o LEXOFFICE conectar WhatsApp Business pela Meta sem depender do redirecionamento OAuth comum. É necessário criar uma configuração de Facebook Login for Business / WhatsApp Embedded Signup no aplicativo Meta.</p><div className="provider-status-row"><span className={status?.configured?'ok':'warn'}>{status?.configured?<CheckCircle2 size={14}/>:<AlertTriangle size={14}/>} App Meta</span><span className={status?.embedded_ready?'ok':'warn'}>{status?.embedded_ready?<CheckCircle2 size={14}/>:<AlertTriangle size={14}/>} Embedded Signup</span><span className={connected?'ok':'warn'}>{connected?<CheckCircle2 size={14}/>:<AlertTriangle size={14}/>} WhatsApp Oficial</span></div><div className="integration-form"><label>Meta App ID<input value={appId} onChange={e=>setAppId(e.target.value)} placeholder="ID do aplicativo"/></label><label>Meta App Secret<input type="password" value={appSecret} onChange={e=>setAppSecret(e.target.value)} placeholder={status?.configured?'Somente para substituir':'App Secret'}/></label><label>ID da configuração Embedded Signup<input value={configId} onChange={e=>setConfigId(e.target.value)} placeholder="Configuration ID do Facebook Login for Business"/></label><button className="secondary" disabled={busy||!appId.trim()||!appSecret.trim()||!configId.trim()} onClick={save}><KeyRound size={15}/>Salvar configuração parceiro</button><button className="integration-action" disabled={busy||!appId.trim()||!configId.trim()||!status?.embedded_ready} onClick={connectPartner}><Facebook size={15}/>{busy?'Conectando...':connectLabel}</button></div>{notice&&<div className="integration-notice">{notice}</div>}{status?.redirect_uri&&<small className="meta-redirect-note">Callback cadastrado: {status.redirect_uri}</small>}</div>
}
