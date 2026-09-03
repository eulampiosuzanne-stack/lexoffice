import { useEffect,useState } from 'react';
import { Plug,MessageCircle,CalendarDays,PenTool,Gavel,Bot,CheckCircle2,RefreshCw,QrCode,AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import WhatsAppAdminSettings from './WhatsAppAdminSettings';
import './integrations.css';

type Conn={provider?:string;status?:string;name?:string;updated_at?:string};
const catalog=[
 {key:'google',name:'Google Agenda',desc:'OAuth e sincronização de compromissos do escritório.',icon:CalendarDays,path:'/agenda'},
 {key:'zapsign',name:'ZapSign',desc:'Envio e acompanhamento de assinaturas eletrônicas.',icon:PenTool,path:'/assinaturas'},
 {key:'tribunal',name:'Tribunais',desc:'Conexões processuais, sincronização e monitoramento.',icon:Gavel,path:'/processos?regra=tribunals'},
 {key:'openai',name:'Inteligência Artificial',desc:'Modelos e agentes especializados do LEXOFFICE.',icon:Bot,path:'/agentes-ia'}
];
function findImage(value:any):string|null{if(!value)return null;if(typeof value==='string'){if(value.startsWith('data:image'))return value;if(value.length>200&&/^[A-Za-z0-9+/=\s]+$/.test(value))return `data:image/png;base64,${value.replace(/\s/g,'')}`;return null}if(typeof value==='object'){for(const k of ['value','image','base64','qrCode','qrcode','qr_code','Qrcode','code']){const found=findImage(value[k]);if(found)return found}for(const v of Object.values(value)){const found=findImage(v);if(found)return found}}return null}
async function getFunctionError(result:any,fallback:string){if(result?.data?.error)return String(result.data.error);const err=result?.error;if(err?.context){try{const body=await err.context.clone().json();if(body?.error)return String(body.error);if(body?.message)return String(body.message)}catch{}}return err?.message||fallback}
export default function Integrations({embedded=false}:{embedded?:boolean}){
 const [connections,setConnections]=useState<Conn[]>([]),[loading,setLoading]=useState(true);
 const [waLoading,setWaLoading]=useState(false),[waConnected,setWaConnected]=useState(false),[waState,setWaState]=useState('verificando'),[qr,setQr]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function invokeWaha(body:any){if(!supabase)return {data:null,error:new Error('Supabase indisponível.')};return supabase.functions.invoke('whatsapp-waha-connect',{body})}
 async function checkWhatsapp(silent=false){const r=await invokeWaha({action:'status'});if(r.error||!r.data?.ok){if(!silent)setError(await getFunctionError(r,'Não foi possível consultar o WhatsApp.'));setWaState('indisponível');return false}const connected=!!r.data.connected;setWaConnected(connected);setWaState(r.data.state||'desconectado');if(connected)setQr(null);return connected}
 async function generateQr(){setWaLoading(true);setError('');setNotice('');if(await checkWhatsapp(true)){setWaLoading(false);setNotice('WhatsApp já está conectado.');return}const r=await invokeWaha({action:'qr'});setWaLoading(false);if(r.error||!r.data?.ok){setError(await getFunctionError(r,'Não foi possível gerar o QR Code.'));return}if(r.data.connected){setWaConnected(true);setQr(null);setWaState(r.data.state||'WORKING');setNotice('WhatsApp já está conectado.');return}const image=findImage(r.data.qr_code??r.data);if(!image){setError('O servidor respondeu, mas não retornou uma imagem de QR Code válida.');return}setQr(image);setWaState(r.data.state||'SCAN_QR_CODE');setNotice('QR Code gerado. Escaneie em WhatsApp > Aparelhos conectados.')}
 useEffect(()=>{if(!supabase){setLoading(false);return}(async()=>{const {data}=await supabase.from('integration_connections').select('provider,status,name,updated_at').order('updated_at',{ascending:false});setConnections(data||[]);setLoading(false);await checkWhatsapp(true)})()},[]);
 useEffect(()=>{if(!qr||waConnected)return;const id=setInterval(()=>void checkWhatsapp(true),3000);return()=>clearInterval(id)},[qr,waConnected]);
 function state(key:string){const c=connections.find(x=>(x.provider||'').toLowerCase().includes(key));return c?.status||null}
 return <div>
  {!embedded&&<div className="page-head"><div><h1>Conexões</h1><p>Configure os serviços externos utilizados pelo escritório e pelos módulos do LEXOFFICE.</p></div><span className="integration-pill"><Plug size={15}/> CONEXÕES DO ESCRITÓRIO</span></div>}
  {embedded&&<div className="module-box" style={{marginBottom:14}}><h3><Plug size={17}/> Conexões do escritório</h3><p>Configure os serviços externos utilizados pelo escritório. Credenciais sensíveis permanecem protegidas no backend.</p></div>}
  <section className="integration-panel"><h3><MessageCircle size={17}/> WhatsApp</h3><div className="integration-head"><div><span className="eyebrow">CONEXÃO DO ESCRITÓRIO</span><h2>{waConnected?'WhatsApp conectado':'Conectar WhatsApp ao LEXOFFICE'}</h2><p>{waConnected?'Canal disponível para atendimento, automações e agentes de IA.':'A conexão é uma configuração administrativa do escritório e não interfere na tela diária de conversas.'}</p></div><span className={waConnected?'conn-status on':'conn-status'}>{waConnected?<CheckCircle2 size={13}/>:<RefreshCw size={13}/>} {waConnected?'Conectado':waState}</span></div>
  {qr&&!waConnected?<div className="qr-panel"><img src={qr} alt="QR Code para conectar o WhatsApp"/><div><span className="eyebrow">QR CODE ATIVO</span><h3>Escaneie pelo WhatsApp</h3><p>Abra WhatsApp &gt; Aparelhos conectados no celular principal do escritório e faça a leitura.</p></div></div>:null}
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button className="integration-action" onClick={waConnected?()=>checkWhatsapp(false):generateQr} disabled={waLoading}>{waConnected?<RefreshCw size={15}/>:<QrCode size={15}/>} {waLoading?'Aguarde...':waConnected?'Atualizar status':'Conectar por QR Code'}</button>{qr&&!waConnected&&<button className="secondary" onClick={generateQr} disabled={waLoading}>Gerar novo QR Code</button>}</div>
  {error&&<div className="status-message error"><AlertCircle size={16}/>{error}</div>}{notice&&<div className="status-message success"><CheckCircle2 size={16}/>{notice}</div>}</section>
  <WhatsAppAdminSettings/>
  <div className="connections-grid">{catalog.map(item=>{const Icon=item.icon;const s=state(item.key);const active=s&&['active','connected','online','ok'].includes(s.toLowerCase());return <a className="connection-card" href={item.path} key={item.key}><div className="connection-top"><div className="integration-icon"><Icon/></div><span className={active?'conn-status on':'conn-status'}>{active?<CheckCircle2 size={13}/>:<RefreshCw size={13}/>} {loading?'Verificando':active?'Conectado':s||'Configurar'}</span></div><h2>{item.name}</h2><p>{item.desc}</p><div className="connection-action">Abrir configuração</div></a>})}</div>
  {!embedded&&<div className="module-box"><h3>Arquitetura integrada</h3><p>As conexões são reutilizadas pelos módulos e pelos agentes de IA. Credenciais sensíveis não são exibidas nesta central.</p></div>}
 </div>
}
