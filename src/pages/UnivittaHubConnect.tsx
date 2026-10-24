import {useEffect,useRef,useState} from 'react';
import {PlugZap,RefreshCw} from 'lucide-react';
import {supabase} from '../lib/supabase';
import './univitta-hub.css';
type State={ok?:boolean;status?:string;environment?:string;qr?:string|null;error?:string;http_status?:number};
const labels:Record<string,string>={pending:'Aguardando pareamento',awaiting_qr:'Aguardando leitura do QR Code',connected:'WhatsApp conectado',disconnected:'Desconectado',connecting:'Conectando'};
export default function UnivittaHubConnect(){
 const [busy,setBusy]=useState(false),[state,setState]=useState<State>({}),[error,setError]=useState('');
 const mounted=useRef(false),running=useRef(false);
 async function request(action:'status'|'connect'|'create'){
  if(!supabase||running.current)return;
  running.current=true;setBusy(true);setError('');
  if(action==='connect'||action==='create')setState(value=>({...value,qr:null}));
  try{
   const {data,error:failure}=await supabase.functions.invoke<State>('whatsapp-evolution-connect',{body:{action:'hub_'+action}});
   if(failure){const details=await (failure as {context?:Response}).context?.json().catch(()=>null);throw new Error(details?.error==='administrator_required'||details?.error==='office_not_authorized'?'A conexão deve ser administrada por um responsável autorizado do escritório.':'Não foi possível consultar o Hub. Tente atualizar o estado.');}
   if(!data?.ok){if(data?.error==='connection_not_created')throw new Error('Crie primeiro a conexão deste escritório.');throw new Error('O Hub não confirmou esta operação.');}
   if(mounted.current)setState(data);
  }catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:'Não foi possível acessar o Hub.');}
  finally{running.current=false;if(mounted.current)setBusy(false)}
 }
 useEffect(()=>{mounted.current=true;void request('status');return()=>{mounted.current=false}},[]);
 return <section className="meta-partner-box" aria-labelledby="univitta-hub-heading">
  <div className="meta-config-title"><PlugZap size={17}/><h3 id="univitta-hub-heading">WhatsApp pelo Univitta Integration Hub</h3></div>
  <p>A aplicação LexOffice é autorizada uma única vez. Cada escritório cria sua própria conexão individual, sem nova aprovação. O provedor atual permanece ativo durante a configuração.</p>
  <p><strong>Ambiente autorizado: {state.environment||'consultando…'}</strong>. A aprovação sandbox não libera automaticamente a operação em produção.</p>
  <p role="status">Estado: <strong>{busy?'Consultando Hub…':labels[state.status||'']||state.status||'Ainda não consultado'}</strong></p>
  {error&&<div className="integration-notice" role="alert">{error}</div>}
  <div className="integration-form"><button type="button" className="secondary" disabled={busy} onClick={()=>void request('status')}><RefreshCw size={16}/>Atualizar estado</button><button type="button" className="integration-action" disabled={busy||!!state.status} onClick={()=>void request('create')}>Criar conexão deste escritório</button><button type="button" className="integration-action" disabled={busy||!state.status||state.status==='connected'} onClick={()=>void request('connect')}>Gerar ou atualizar QR Code do Hub</button></div>
  {state.qr&&state.status!=='connected'&&<div className="integration-notice"><img className="univitta-hub-qr" src={state.qr} alt="QR Code para conectar o WhatsApp ao LexOffice pelo Hub"/><p>No WhatsApp Business, abra Aparelhos conectados → Conectar aparelho. Escaneie este QR Code e depois clique em Atualizar estado. Se expirar, gere outro.</p></div>}
  <small>O pareamento não ativa os envios do LexOffice. A troca do provedor depende da liberação do ambiente e da validação de envio e recebimento.</small>
 </section>;
}
