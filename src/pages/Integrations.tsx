import InternalNavigation from '../components/InternalNavigation';
import { useEffect,useState } from 'react';
import { Plug,CalendarDays,Gavel,Bot,SearchCheck,CheckCircle2,RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {Link,useSearchParams,useNavigate} from 'react-router-dom';
import WhatsAppConnections from './WhatsAppConnections';
import './integrations.css';

type Conn={provider?:string;status?:string;name?:string;updated_at?:string;settings?:any};
const catalog=[
 {key:'google',name:'Google Agenda',desc:'OAuth e sincronização de compromissos do escritório.',icon:CalendarDays,path:'/agenda'},
 {key:'tribunal',name:'Tribunais',desc:'Conexões processuais, sincronização e monitoramento.',icon:Gavel,path:'/tribunais'},
 {key:'escavador',name:'Escavador — Monitoramento da OAB',desc:'Descubra e monitore processos vinculados à sua inscrição da OAB.',icon:SearchCheck,path:'/tribunais'},
 {key:'openai',name:'Inteligência Artificial',desc:'Modelos e agentes especializados do LEXOFFICE.',icon:Bot,path:'/agentes-ia?area=infraestrutura'}
];
export default function Integrations({embedded=false}:{embedded?:boolean}){
 const [params,setParams]=useSearchParams();const navigate=useNavigate();useEffect(()=>{if(params.get('secao')==='atendimento')navigate('/configuracoes/atendimento',{replace:true})},[params,navigate]);
 const [tab,setTab]=useState<'whatsapp'|'servicos'>(params.get('secao')==='servicos'?'servicos':'whatsapp');const [connections,setConnections]=useState<Conn[]>([]),[loading,setLoading]=useState(true),[isPlatformAdmin,setIsPlatformAdmin]=useState(false);
 useEffect(()=>{if(!supabase){setLoading(false);return}(async()=>{const {data:{user}}=await supabase.auth.getUser();const [{data},{data:admin}]=await Promise.all([supabase.from('integration_connections').select('provider,status,name,updated_at,settings').order('updated_at',{ascending:false}),user?supabase.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle():Promise.resolve({data:null} as any)]);setConnections(data||[]);setIsPlatformAdmin(!!admin);setLoading(false)})()},[]);
 useEffect(()=>{setTab(params.get('secao')==='servicos'?'servicos':'whatsapp')},[params]);
 function state(key:string){const c=connections.find(x=>(x.provider||'').toLowerCase().includes(key));return c?.status||null}
 return <div>
  {!embedded&&<div className="page-head"><div><h1>Conexões</h1><p>Configure os serviços externos utilizados pelo escritório e pelos módulos do LEXOFFICE.</p></div><span className="integration-pill"><Plug size={15}/> CONEXÕES DO ESCRITÓRIO</span></div>}
  {embedded&&<div className="module-box" style={{marginBottom:14}}><h3><Plug size={17}/> Conexões do escritório</h3><p>Configure os serviços externos utilizados pelo escritório. Credenciais sensíveis permanecem protegidas no backend.</p></div>}
  <InternalNavigation variant="underline" aria-label="Seções de Integrações">{([['whatsapp','Conexão do WhatsApp'],['servicos','Outros serviços']] as const).map(([k,l])=><button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>{setTab(k);setParams({secao:k})}}>{l}</button>)}</InternalNavigation>
  {tab==='whatsapp'&&<WhatsAppConnections/>}
  {tab==='servicos'&&<>{isPlatformAdmin&&<p><Link to="/configuracoes/provedores-processuais">Configurar provedores processuais da plataforma →</Link></p>}
  <div className="connections-grid">{catalog.map(item=>{const Icon=item.icon;const s=state(item.key);const active=s&&['active','connected','online','ok'].includes(s.toLowerCase());return <a className="connection-card" href={item.path} key={item.key}><div className="connection-top"><div className="integration-icon"><Icon/></div><span className={active?'conn-status on':'conn-status'}>{active?<CheckCircle2 size={13}/>:<RefreshCw size={13}/>} {loading?'Verificando':active?'Conectado':s||'Configurar'}</span></div><h2>{item.name}</h2><p>{item.desc}</p><div className="connection-action">Abrir configuração</div></a>})}</div></>}
<div className="module-box"><h3>Conexão e comportamento têm funções diferentes</h3><p>Aqui você conecta os canais. Para ligar a IA, definir retomada e acompanhamento de contatos, use as regras gerais de atendimento.</p><Link to="/configuracoes/atendimento">Configurar atendimento automático →</Link></div>
 </div>
}
