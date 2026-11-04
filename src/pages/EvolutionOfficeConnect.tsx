import {useState} from 'react';
import {PlugZap, RefreshCw} from 'lucide-react';
import {supabase} from '../lib/supabase';

type HubResult = {ok?:boolean;error?:string;status?:string;connection_id?:string;environment?:string;qr?:string|null;http_status?:number;delivery_enabled?:boolean};

export default function EvolutionOfficeConnect(){
 const [busy,setBusy]=useState(false);
 const [state,setState]=useState('');
 const [message,setMessage]=useState('');
 const [qr,setQr]=useState('');
 async function request(action:'hub_status'|'hub_connect'){
  if(!supabase)return;
  setBusy(true);setMessage('');
  if(action==='hub_connect')setQr('');
  try{
   const {data,error}=await supabase.functions.invoke<HubResult>('whatsapp-evolution-connect',{body:{action}});
   if(error)throw error;
   if(!data?.ok){
    setMessage('O Hub não concluiu a operação: '+(data?.error||'sem resposta')+(data?.http_status?' (HTTP '+data.http_status+')':''));
    return;
   }
   setState(String(data.status||'aguardando conexão'));
   if(data.qr)setQr(data.qr);
   setMessage(data.qr?'QR Code recebido do Hub Univitta. Escaneie pelo WhatsApp Business.':data.status==='connected'?'WhatsApp conectado ao Hub Univitta.':'Hub consultado. '+(action==='hub_connect'?'Ainda não retornou um QR Code.':'Use Conectar pelo Hub para solicitar o QR Code.'));
  }catch(e:any){setMessage('Falha ao acessar o Hub: '+String(e?.message||'erro de conexão'))}
  finally{setBusy(false)}
 }
 return <div className="meta-partner-box">
  <div className="meta-config-title"><PlugZap size={17}/><b>Hub Evolution Univitta | WhatsApp do escritório</b></div>
  <p>Número autorizado: <strong>+55 31 99298-4141</strong>. A conexão de Gláucia não será alterada.</p>
  {state&&<p>Estado no Hub: <strong>{state}</strong></p>}
  <div className="integration-form">
   <button type="button" className="secondary" disabled={busy} onClick={()=>request('hub_status')}><RefreshCw size={15}/>Consultar conexão no Hub</button>
   <button type="button" className="integration-action" disabled={busy} onClick={()=>request('hub_connect')}>Conectar pelo Hub / Gerar QR Code</button>
  </div>
  {qr&&<div className="integration-notice"><strong>QR Code do Hub Evolution</strong><p>No WhatsApp Business, abra Aparelhos conectados e escaneie o código.</p><img src={qr} alt="QR Code do Hub Evolution Univitta" style={{width:260,height:260,maxWidth:'100%'}} /></div>}
  {message&&<div className="integration-notice" role="status">{message}</div>}
  <small>O Hub está autorizado para testes. A conexão não ativa envios automáticos sem homologação.</small>
 </div>;
}