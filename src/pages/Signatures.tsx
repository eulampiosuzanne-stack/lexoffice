import { useEffect,useState } from 'react';
import { Send,PenTool,RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './integrations.css';

type RequestRow={id:string;title?:string|null;status?:string|null;external_id?:string|null;sent_at?:string|null;expires_at?:string|null;document_id?:string|null;created_at?:string|null};

export default function Signatures(){
 const [rows,setRows]=useState<RequestRow[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState('');
 async function load(){if(!supabase)return;setLoading(true);setNotice('');const {data,error}=await supabase.from('signature_requests').select('id,title,status,external_id,sent_at,expires_at,document_id,created_at').order('created_at',{ascending:false});if(error)setNotice(error.message);else setRows((data||[]) as RequestRow[]);setLoading(false)}
 useEffect(()=>{load()},[]);
 async function send(id:string){if(!supabase)return;setBusy(id);setNotice('');const {data,error}=await supabase.functions.invoke('zapsign-send-signature',{body:{signature_request_id:id}});if(error)setNotice(error.message);else if((data as any)?.error)setNotice((data as any).error);else{setNotice('Documento enviado para assinatura pela ZapSign.');await load()}setBusy(null)}
 return <><div className="page-title"><h1>Assinaturas</h1><p>Solicitações de assinatura eletrônica integradas à ZapSign</p></div><div className="integration-head"><div><span className="integration-pill"><PenTool size={14}/> ZAPSIGN</span><h2>Central de assinaturas</h2><p>Envie solicitações já preparadas no LEXOFFICE e acompanhe o status real.</p></div><button className="integration-action" onClick={load}><RefreshCw size={16}/> Atualizar</button></div>{notice&&<div className="integration-notice">{notice}</div>}<div className="integration-panel">{loading?<p>Carregando solicitações...</p>:rows.length===0?<div className="integration-empty"><PenTool size={30}/><h3>Nenhuma solicitação encontrada</h3><p>As solicitações criadas no LEXOFFICE aparecerão aqui para envio à ZapSign.</p></div>:<div className="signature-list">{rows.map(r=><div className="signature-row" key={r.id}><div><strong>{r.title||'Documento para assinatura'}</strong><small>Status: {r.status||'pendente'}{r.expires_at?` • vence ${new Date(r.expires_at).toLocaleDateString('pt-BR')}`:''}</small></div><div className="signature-actions"><span className={`status-dot ${r.status==='signed'?'ok':''}`}>{r.status||'pending'}</span>{!r.external_id&&r.status!=='sent'&&r.status!=='signed'&&<button className="integration-action" disabled={busy===r.id||!r.document_id} onClick={()=>send(r.id)}><Send size={15}/>{busy===r.id?'Enviando...':'Enviar ZapSign'}</button>}</div></div>)}</div>}</div></>
}
