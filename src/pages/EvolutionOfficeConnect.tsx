import {useState} from 'react';
import {PlugZap, RefreshCw} from 'lucide-react';
import {supabase} from '../lib/supabase';

type Result = {ok?:boolean;error?:string;reason?:string;state?:string|null;status?:string;instance_name?:string;pairing_code?:string;http_status?:number;instance_status?:string};

export default function EvolutionOfficeConnect(){
 const [busy,setBusy]=useState(false);
 const [state,setState]=useState('');
 const [message,setMessage]=useState('');
 const [code,setCode]=useState('');
 const [created,setCreated]=useState(false);
 async function request(action:'status'|'create'|'pair'){
  if(!supabase)return;
  setBusy(true);setMessage('');
  if(action==='pair')setCode('');
  try{
   const {data,error}=await supabase.functions.invoke<Result>('whatsapp-evolution-connect',{body:{action,...(action==='pair'?{number:'5531992984141'}:{})}});
   if(error){
    const response=(error as any).context as Response|undefined;
    const payload=await response?.json?.().catch(()=>null) as Result|null;
    const detail=payload?.error||payload?.reason||error.message;
    if(payload?.error==='create_instance_first'){
      setMessage('Primeiro clique em "1. Criar instÃ¢ncia exclusiva". A instÃ¢ncia ainda nÃ£o foi criada.');
      return;
    }
    if(payload?.error==='instance_already_registered'){
      setCreated(true);
      setMessage('A instÃ¢ncia jÃ¡ estÃ¡ cadastrada. Agora solicite o cÃ³digo de pareamento.');
      return;
    }
    setMessage('Falha na conexÃ£o: '+detail+(response?.status?' (HTTP '+response.status+')':''));
    return;
   }
   if(!data?.ok){
    if(data?.error==='instance_already_registered'){setCreated(true);setMessage('A instância já foi criada. Agora solicite o código.');return}
    setMessage('A operação não foi concluída: '+(data?.error||data?.reason||'sem resposta')+(data?.http_status?' (HTTP '+data.http_status+')':''));
    return;
   }
   if(action==='create'){setCreated(true);setMessage('Instância criada no servidor. Agora solicite o código de pareamento.')}
   if(action==='status'){setState(data.state||'Sem conexão');setMessage('Estado consultado no servidor.')}
   if(action==='pair'){setCode(String(data.pairing_code||''));setMessage('Código gerado. Digite-o no WhatsApp Business antes de expirar.')}
  }catch(e:any){setMessage('Não foi possível executar a operação: '+String(e?.message||'falha de conexão'))}
  finally{setBusy(false)}
 }
 return <div className="meta-partner-box">
  <div className="meta-config-title"><PlugZap size={17}/><b>Evolution API | WhatsApp do escritório</b></div>
  <p>Instância exclusiva: <strong>suzanne-lexoffice</strong>. Número: <strong>+55 31 99298-4141</strong>. A instância Gláucia não será alterada.</p>
  {state&&<p>Estado no servidor: <strong>{state}</strong></p>}
  <div className="integration-form">
   <button type="button" className="secondary" disabled={busy} onClick={()=>request('status')}><RefreshCw size={15}/>Consultar conexão</button>
   <button type="button" className="secondary" disabled={busy} onClick={()=>request('create')}>1. Criar instância exclusiva</button>
   <button type="button" className="integration-action" disabled={busy||!created} onClick={()=>request('pair')}>2. Gerar código de pareamento</button>
  </div>
  {code&&<div className="integration-notice"><strong>Código de pareamento: {code}</strong><p>No WhatsApp Business do número informado, abra Aparelhos conectados, Conectar aparelho e Conectar com número de telefone. Não envie o código a terceiros.</p></div>}
  {message&&<div className="integration-notice" role="status">{message}</div>}
  <small>Conexão não ativa automaticamente o envio de mensagens do LexOffice. A integração será testada antes da migração.</small>
 </div>;
}
