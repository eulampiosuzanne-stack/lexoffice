import { useEffect,useState } from 'react';
import { Plug,MessageCircle,CalendarDays,PenTool,Gavel,Bot,SearchCheck,CheckCircle2,RefreshCw,QrCode } from 'lucide-react';
import { supabase } from '../lib/supabase';
import WhatsAppAdminSettings from './WhatsAppAdminSettings';
import MetaPartnerConnect from './MetaPartnerConnect';
import PlatformProcessProviders from './PlatformProcessProviders';
import './integrations.css';

type Conn={provider?:string;status?:string;name?:string;updated_at?:string;settings?:any};
const catalog=[
 {key:'google',name:'Google Agenda',desc:'OAuth e sincronização de compromissos do escritório.',icon:CalendarDays,path:'/agenda'},
 {key:'zapsign',name:'ZapSign',desc:'Envio e acompanhamento de assinaturas eletrônicas.',icon:PenTool,path:'/assinaturas'},
 {key:'tribunal',name:'Tribunais',desc:'Conexões processuais, sincronização e monitoramento.',icon:Gavel,path:'/processos?regra=tribunals'},
 {key:'escavador',name:'Escavador — Monitoramento da OAB',desc:'Descubra e monitore processos vinculados à sua inscrição da OAB.',icon:SearchCheck,path:'/tribunais'},
 {key:'openai',name:'Inteligência Artificial',desc:'Modelos e agentes especializados do LEXOFFICE.',icon:Bot,path:'/agentes-ia'}
];
export default function Integrations({embedded=false}:{embedded?:boolean}){
 const [connections,setConnections]=useState<Conn[]>([]),[loading,setLoading]=useState(true),[isPlatformAdmin,setIsPlatformAdmin]=useState(false),[qrBusy,setQrBusy]=useState(false),[qr,setQr]=useState(''),[qrError,setQrError]=useState('');
 useEffect(()=>{if(!supabase){setLoading(false);return}(async()=>{const {data:{user}}=await supabase.auth.getUser();const [{data},{data:admin}]=await Promise.all([supabase.from('integration_connections').select('provider,status,name,updated_at,settings').order('updated_at',{ascending:false}),user?supabase.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle():Promise.resolve({data:null} as any)]);setConnections(data||[]);setIsPlatformAdmin(!!admin);setLoading(false)})()},[]);
 async function connectWhatsApp(){if(!supabase)return;setQrBusy(true);setQrError('');setQr('');const {data,error}=await supabase.functions.invoke('whatsapp-zapi-qrcode',{body:{action:'qrcode'}});setQrBusy(false);if(error||data?.error){setQrError(String(data?.error||error?.message||'Não foi possível gerar o QR Code.'));return}const value=data?.qrcode||data?.qrCode||data?.qr||data?.image||data?.base64||'';if(value)setQr(String(value));else setQrError('QR Code não retornado pela conexão.')} 
 function state(key:string){const c=connections.find(x=>(x.provider||'').toLowerCase().includes(key));return c?.status||null}
 const zapi=connections.find(x=>{const p=String(x.provider||'').toLowerCase(),s=String(x.settings?.provider||'').toLowerCase();return p.includes('zapi')||p.includes('z-api')||s==='zapi'||s==='z-api'});
 const zapiConnected=!!zapi&&['active','connected','online','ok'].includes(String(zapi.status||'').toLowerCase());
 return <div>
  {!embedded&&<div className="page-head"><div><h1>Conexões</h1><p>Configure os serviços externos utilizados pelo escritório e pelos módulos do LEXOFFICE.</p></div><span className="integration-pill"><Plug size={15}/> CONEXÕES DO ESCRITÓRIO</span></div>}
  {embedded&&<div className="module-box" style={{marginBottom:14}}><h3><Plug size={17}/> Conexões do escritório</h3><p>Configure os serviços externos utilizados pelo escritório. Credenciais sensíveis permanecem protegidas no backend.</p></div>}
  <section className="integration-panel"><h3><MessageCircle size={17}/> WhatsApp · Z-API</h3><div className="integration-head"><div><span className="eyebrow">CONEXÃO DO USUÁRIO</span><h2>{zapiConnected?'WhatsApp conectado':'Conectar WhatsApp'}</h2><p>Conecte o número utilizado por este usuário através do QR Code. A sessão permanece vinculada à conta autenticada.</p></div><span className={zapiConnected?'conn-status on':'conn-status'}>{zapiConnected?<CheckCircle2 size={13}/>:<RefreshCw size={13}/>} {loading?'Verificando':zapiConnected?'Conectado':zapi?.status||'Não conectado'}</span></div>{!zapiConnected&&<div style={{marginTop:14}}><button className="integration-action" onClick={connectWhatsApp} disabled={qrBusy}><QrCode size={15}/> {qrBusy?'Gerando QR Code...':'Conectar número por QR Code'}</button>{qr&&<div style={{marginTop:14}}><img src={qr.startsWith('data:')?qr:`data:image/png;base64,${qr}`} alt="QR Code do WhatsApp" style={{width:220,maxWidth:'100%',background:'#fff',padding:10,borderRadius:12}}/><p>Abra o WhatsApp no celular e leia este QR Code em <b>Aparelhos conectados</b>.</p></div>}{qrError&&<div className="status-message error" style={{marginTop:12}}>{qrError}</div>}</div>}</section>
  <WhatsAppAdminSettings/>
  <MetaPartnerConnect/>
  {isPlatformAdmin&&<PlatformProcessProviders/>}
  <div className="connections-grid">{catalog.map(item=>{const Icon=item.icon;const s=state(item.key);const active=s&&['active','connected','online','ok'].includes(s.toLowerCase());return <a className="connection-card" href={item.path} key={item.key}><div className="connection-top"><div className="integration-icon"><Icon/></div><span className={active?'conn-status on':'conn-status'}>{active?<CheckCircle2 size={13}/>:<RefreshCw size={13}/>} {loading?'Verificando':active?'Conectado':s||'Configurar'}</span></div><h2>{item.name}</h2><p>{item.desc}</p><div className="connection-action">Abrir configuração</div></a>})}</div>
  {!embedded&&<div className="module-box"><h3>Arquitetura integrada</h3><p>As conexões são reutilizadas pelos módulos e pelos agentes de IA. Credenciais sensíveis não são exibidas nesta central.</p></div>}
 </div>
}
