import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,QrCode,RefreshCw,Smartphone} from 'lucide-react';
import {supabase} from '../lib/supabase';

// WhatsApp do escritório (número 4141). O provedor real é escolhido no backend
// (system_runtime_secrets.whatsapp_provider); a tela só pede estado, QR Code ou código.
type Result={ok?:boolean;error?:string;state?:string|null;connected?:boolean;instance_name?:string;qr_code?:string;pairing_code?:string;http_status?:number};
const NUMBER='5531992984141';
const labels:Record<string,string>={connected:'Conectado',open:'Conectado',connecting:'Conectando…',qr_pending:'Aguardando leitura do QR Code',disconnected:'Desconectado',close:'Desconectado'};
const errors:Record<string,string>={qr_code_unavailable:'O servidor do WhatsApp não devolveu o QR Code. Tente de novo em alguns segundos.',pairing_code_unavailable:'O servidor do WhatsApp não devolveu o código. Tente de novo em alguns segundos.',administrator_required:'Só a administradora do escritório pode conectar o WhatsApp.',office_instance_missing:'A conexão do escritório não está cadastrada.',uazapi_server_configuration_invalid:'O servidor do WhatsApp não está configurado.',evolution_server_configuration_invalid:'O servidor do WhatsApp não está configurado.',uazapi_request_failed:'O servidor do WhatsApp não respondeu.',evolution_request_failed:'O servidor do WhatsApp não respondeu.'};
const asImage=(v:string)=>v.startsWith('data:image')?v:'data:image/png;base64,'+v;

export default function EvolutionOfficeConnect(){
 const [busy,setBusy]=useState(false);
 const [state,setState]=useState('');
 const [qr,setQr]=useState('');
 const [code,setCode]=useState('');
 const [message,setMessage]=useState('');
 const mounted=useRef(true);

 async function call(body:Record<string,unknown>):Promise<Result>{
  if(!supabase)throw new Error('Sem conexão com o servidor.');
  const {data,error}=await supabase.functions.invoke<Result>('whatsapp-evolution-connect',{body});
  if(error){const d=await (error as {context?:Response}).context?.json().catch(()=>null);throw new Error(errors[d?.error]||'Não foi possível falar com o servidor do WhatsApp.');}
  if(data&&data.ok===false&&data.error)throw new Error(errors[data.error]||'O servidor do WhatsApp não concluiu a operação.');
  return data||{};
 }

 async function refresh(silent=false){
  if(!silent){setBusy(true);setMessage('');}
  try{
   const r=await call({action:'status'});
   if(!mounted.current)return;
   const s=r.connected?'connected':String(r.state||'disconnected');
   setState(s);
   if(r.connected){setQr('');setCode('');setMessage('WhatsApp conectado. A LEX já pode enviar e receber mensagens.');}
   else if(r.ok===false&&!silent)setMessage('Não foi possível consultar o estado agora. Tente de novo.');
  }catch(e){if(mounted.current&&!silent)setMessage(e instanceof Error?e.message:'Erro ao consultar.');}
  finally{if(mounted.current&&!silent)setBusy(false);}
 }

 async function connectQr(){
  setBusy(true);setMessage('');setCode('');setQr('');
  try{const r=await call({action:'qr'});if(!mounted.current)return;if(!r.qr_code)throw new Error(errors.qr_code_unavailable);setQr(asImage(r.qr_code));setState('qr_pending');}
  catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'Erro ao gerar o QR Code.');}
  finally{if(mounted.current)setBusy(false);}
 }

 async function connectCode(){
  setBusy(true);setMessage('');setQr('');setCode('');
  try{const r=await call({action:'pair',number:NUMBER});if(!mounted.current)return;if(!r.pairing_code)throw new Error(errors.pairing_code_unavailable);setCode(String(r.pairing_code));setState('qr_pending');}
  catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'Erro ao gerar o código.');}
  finally{if(mounted.current)setBusy(false);}
 }

 useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false}},[]);
 // Enquanto o QR Code ou o código estiver na tela, confere sozinho a cada 5 s se já conectou.
 useEffect(()=>{if(!qr&&!code)return;const t=setInterval(()=>void refresh(true),5000);return()=>clearInterval(t)},[qr,code]);

 const connected=state==='connected'||state==='open';
 return <section className="meta-partner-box office-whatsapp-card" aria-labelledby="office-whatsapp-heading">
  <div className="meta-config-title"><Smartphone size={18}/><h3 id="office-whatsapp-heading">WhatsApp do escritório</h3></div>
  <p>Número: <strong>+55 31 99298-4141</strong></p>
  <p role="status">Estado: <strong className={connected?'office-wa-ok':'office-wa-off'}>{busy&&!state?'Consultando…':labels[state]||state||'Ainda não consultado'}</strong></p>
  {connected
   ?<div className="meta-connected"><CheckCircle2 size={17}/><div><b>Conectado</b><small>Não remova este aparelho em “Aparelhos conectados” no celular.</small></div></div>
   :<div className="integration-form">
     <button type="button" className="integration-action" disabled={busy} onClick={()=>void connectQr()}><QrCode size={16}/>Conectar por QR Code</button>
     <button type="button" className="secondary" disabled={busy} onClick={()=>void connectCode()}>Conectar por código</button>
    </div>}
  <div className="integration-form"><button type="button" className="secondary" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={15}/>Atualizar estado</button></div>
  {qr&&!connected&&<div className="integration-notice"><img src={qr} alt="QR Code para conectar o WhatsApp do escritório" style={{width:260,height:260,maxWidth:'100%',background:'#fff',padding:8,borderRadius:8}}/><p>No celular do 4141: WhatsApp Business → Aparelhos conectados → Conectar aparelho → leia este código. Ele expira em poucos segundos; se expirar, clique de novo em “Conectar por QR Code”.</p></div>}
  {code&&!connected&&<div className="integration-notice"><p>No celular do 4141: WhatsApp Business → Aparelhos conectados → Conectar aparelho → “Conectar com número de telefone” e digite:</p><strong style={{fontSize:28,letterSpacing:4}}>{code}</strong></div>}
  {message&&<div className="integration-notice" role="status">{message}</div>}
 </section>;
}
