import { useEffect, useState } from 'react';
import { MessageCircle, QrCode, RefreshCw, Send, Smartphone, CheckCircle2, AlertCircle, Wifi, ShieldCheck, Bot, Clock3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './integrations.css';

function findImage(value:any):string|null{
  if(!value)return null;
  if(typeof value==='string'){
    if(value.startsWith('data:image'))return value;
    if(value.length>200&&/^[A-Za-z0-9+/=\s]+$/.test(value))return `data:image/png;base64,${value.replace(/\s/g,'')}`;
    return null;
  }
  if(typeof value==='object'){
    for(const k of ['value','image','base64','qrCode','qrcode','qr_code','Qrcode','code']){const found=findImage(value[k]);if(found)return found;}
    for(const v of Object.values(value)){const found=findImage(v);if(found)return found;}
  }
  return null;
}
async function getFunctionError(result:any,fallback:string){
  if(result?.data?.error)return String(result.data.error);
  const err=result?.error;
  if(err?.context){try{const body=await err.context.clone().json();if(body?.error)return String(body.error);if(body?.message)return String(body.message);}catch{}}
  return err?.message||fallback;
}
export default function WhatsApp(){
  const[qr,setQr]=useState<string|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[phone,setPhone]=useState(''),[message,setMessage]=useState(''),[notice,setNotice]=useState(''),[connected,setConnected]=useState(false),[state,setState]=useState('verificando');
  async function invokeWaha(body:any){if(!supabase)return {data:null,error:new Error('Supabase indisponível.')};return supabase.functions.invoke('whatsapp-waha-connect',{body});}
  async function checkStatus(silent=false){
    if(!supabase)return false;const r=await invokeWaha({action:'status'});
    if(r.error||!r.data?.ok){if(!silent)setError(await getFunctionError(r,'Não foi possível consultar o WhatsApp.'));setState('indisponível');return false;}
    setConnected(!!r.data.connected);setState(r.data.state||'desconectado');if(r.data.connected){setQr(null);setNotice('WhatsApp conectado.');}return !!r.data.connected;
  }
  useEffect(()=>{checkStatus(true)},[]);useEffect(()=>{if(!qr||connected)return;const id=setInterval(()=>checkStatus(true),3000);return()=>clearInterval(id)},[qr,connected]);
  async function generateQr(){
    if(!supabase)return;setLoading(true);setError('');setNotice('');if(await checkStatus(true)){setLoading(false);return}
    const r=await invokeWaha({action:'qr'});setLoading(false);
    if(r.error||!r.data?.ok){setError(await getFunctionError(r,'Não foi possível gerar o QR Code.'));return}
    if(r.data.connected){setConnected(true);setQr(null);setState(r.data.state||'WORKING');setNotice('WhatsApp já está conectado.');return}
    const image=findImage(r.data.qr_code??r.data);if(!image){setError('O servidor respondeu, mas não retornou uma imagem de QR Code válida.');return}
    setQr(image);setState(r.data.state||'SCAN_QR_CODE');setNotice('QR Code gerado. Escaneie em WhatsApp > Aparelhos conectados.');
  }
  async function sendTest(e:any){e.preventDefault();if(!supabase||!phone||!message)return;setLoading(true);setError('');setNotice('');const r=await invokeWaha({action:'send',phone,message});setLoading(false);if(r.error||!r.data?.ok){setError(await getFunctionError(r,'Falha ao enviar mensagem pelo WhatsApp.'));return}setNotice('Mensagem enviada pelo WhatsApp.');}
  return <div className="wa-workspace"><div className="page-head wa-head"><div><span className="eyebrow">CLIENTE & COMUNICAÇÃO</span><h1>WhatsApp</h1><p>Conecte o número do escritório, valide o canal e acompanhe o estado da automação.</p></div><div className={`wa-status-pill ${connected?'on':''}`}><span className="status-dot"/>{connected?'Conectado':'WAHA'}</div></div><div className="wa-kpis"><div><Wifi/><span>Canal</span><strong>{connected?'Online':'Offline'}</strong></div><div><ShieldCheck/><span>Provedor</span><strong>WAHA</strong></div><div><Bot/><span>Agentes IA</span><strong>{connected?'Prontos':'Aguardando'}</strong></div><div><Clock3/><span>Status</span><strong>{state}</strong></div></div><div className="wa-layout"><section className="wa-connect-panel"><div className="panel-top"><div className="integration-icon"><Smartphone/></div><div><span className="eyebrow">CONEXÃO DO ESCRITÓRIO</span><h2>{connected?'WhatsApp conectado':'Conectar WhatsApp ao LEXOFFICE'}</h2><p>{connected?'O canal está pronto para uso e pode ser utilizado pelos fluxos do escritório.':'Gere o QR Code e faça a leitura pelo aparelho principal do escritório.'}</p></div></div><div className="wa-connect-body">{qr&&!connected?<div className="qr-focus"><img src={qr} alt="QR Code WhatsApp"/><div><span className="eyebrow">QR CODE ATIVO</span><h3>Escaneie pelo WhatsApp</h3><p>Abra <b>Aparelhos conectados</b> no celular e faça a leitura. O LEXOFFICE atualiza o status automaticamente.</p></div></div>:<div className={`connection-hero ${connected?'connected':''}`}><div className="phone-orbit"><Smartphone size={30}/></div><div><strong>{connected?'Canal conectado':'Canal ainda não conectado'}</strong><span>Status WAHA: {state}</span></div></div>}</div><div className="panel-actions"><button className="primary" onClick={connected?()=>checkStatus(false):generateQr} disabled={loading}>{connected?<RefreshCw size={16}/>:<QrCode size={16}/>} {loading?'Aguarde...':connected?'Atualizar status':qr?'Gerar novo QR Code':'Conectar por QR Code'}</button></div></section><aside className="wa-side"><section className="wa-mini-card"><span className="eyebrow">TESTE DO CANAL</span><h2>Enviar mensagem</h2><p>Faça um envio de teste depois que a conexão estiver ativa.</p><form className="channel-form" onSubmit={sendTest}><label>Telefone<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="5531999999999"/></label><label>Mensagem<textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Mensagem de teste do LEXOFFICE"/></label><button className="secondary" disabled={loading||!connected}><Send size={15}/> Enviar teste</button></form></section><section className="wa-mini-card compact"><div className="mini-row"><MessageCircle/><div><b>Atendimento</b><span>Canal centralizado para equipe e agentes</span></div></div><div className="mini-row"><Bot/><div><b>Automação</b><span>Integração preparada para fluxos inteligentes</span></div></div></section></aside></div>{error&&<div className="status-message error"><AlertCircle size={16}/>{error}</div>}{notice&&<div className="status-message success"><CheckCircle2 size={16}/>{notice}</div>}</div>}
