import { useEffect,useState } from 'react';
import { Plug,CalendarDays,Gavel,Bot,SearchCheck,CheckCircle2,RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import WhatsAppAdminSettings from './WhatsAppAdminSettings';
import ConnectMetaWhatsApp from '../components/ConnectMetaWhatsApp';
import EvolutionOfficeConnect from './EvolutionOfficeConnect';
import PlatformProcessProviders from './PlatformProcessProviders';
import './integrations.css';
import './subtabs.css';

type Conn={provider?:string;status?:string;name?:string;updated_at?:string;settings?:any};
const catalog=[
 {key:'google',name:'Google Agenda',desc:'OAuth e sincronização de compromissos do escritório.',icon:CalendarDays,path:'/agenda'},
 {key:'tribunal',name:'Tribunais',desc:'Conexões processuais, sincronização e monitoramento.',icon:Gavel,path:'/processos?regra=tribunals'},
 {key:'escavador',name:'Escavador — Monitoramento da OAB',desc:'Descubra e monitore processos vinculados à sua inscrição da OAB.',icon:SearchCheck,path:'/tribunais'},
 {key:'openai',name:'Inteligência Artificial',desc:'Modelos e agentes especializados do LEXOFFICE.',icon:Bot,path:'/agentes-ia'}
];
export default function Integrations({embedded=false}:{embedded?:boolean}){
 const [tab,setTab]=useState<'whatsapp'|'atendimento'|'servicos'>('whatsapp');const [connections,setConnections]=useState<Conn[]>([]),[loading,setLoading]=useState(true),[isPlatformAdmin,setIsPlatformAdmin]=useState(false);
 useEffect(()=>{if(!supabase){setLoading(false);return}(async()=>{const {data:{user}}=await supabase.auth.getUser();const [{data},{data:admin}]=await Promise.all([supabase.from('integration_connections').select('provider,status,name,updated_at,settings').order('updated_at',{ascending:false}),user?supabase.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle():Promise.resolve({data:null} as any)]);setConnections(data||[]);setIsPlatformAdmin(!!admin);setLoading(false)})()},[]);
 function state(key:string){const c=connections.find(x=>(x.provider||'').toLowerCase().includes(key));return c?.status||null}
 return <div>
  {!embedded&&<div className="page-head"><div><h1>Conexões</h1><p>Configure os serviços externos utilizados pelo escritório e pelos módulos do LEXOFFICE.</p></div><span className="integration-pill"><Plug size={15}/> CONEXÕES DO ESCRITÓRIO</span></div>}
  {embedded&&<div className="module-box" style={{marginBottom:14}}><h3><Plug size={17}/> Conexões do escritório</h3><p>Configure os serviços externos utilizados pelo escritório. Credenciais sensíveis permanecem protegidas no backend.</p></div>}
  <div className="lx-subtabs" role="tablist" aria-label="Seções de Integrações">{([['whatsapp','Conexão do WhatsApp'],['atendimento','Controle do atendimento (IA, humano e follow-up)'],['servicos','Outros serviços']] as const).map(([k,l])=><button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
  {tab==='whatsapp'&&<><EvolutionOfficeConnect/><ConnectMetaWhatsApp/></>}
  {tab==='atendimento'&&<WhatsAppAdminSettings/>}
  {tab==='servicos'&&<>{isPlatformAdmin&&<PlatformProcessProviders/>}
  <div className="connections-grid">{catalog.map(item=>{const Icon=item.icon;const s=state(item.key);const active=s&&['active','connected','online','ok'].includes(s.toLowerCase());return <a className="connection-card" href={item.path} key={item.key}><div className="connection-top"><div className="integration-icon"><Icon/></div><span className={active?'conn-status on':'conn-status'}>{active?<CheckCircle2 size={13}/>:<RefreshCw size={13}/>} {loading?'Verificando':active?'Conectado':s||'Configurar'}</span></div><h2>{item.name}</h2><p>{item.desc}</p><div className="connection-action">Abrir configuração</div></a>})}</div></>}
  {!embedded&&<div className="module-box"><h3>Arquitetura integrada</h3><p>As conexões são reutilizadas pelos módulos e pelos agentes de IA. Credenciais sensíveis não são exibidas nesta central.</p></div>}
 </div>
}
