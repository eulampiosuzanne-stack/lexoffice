import { useEffect, useMemo, useState } from 'react';
import { Clock3, FileCheck2, FileText, Plug, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './integrations.css';

type SignatureRow = {
  id:string;
  title?:string|null;
  status?:string|null;
  signer_name?:string|null;
  created_at?:string|null;
  sent_at?:string|null;
  signed_at?:string|null;
  provider?:string|null;
};

const ptDate=(value?:string|null)=>value?new Date(value).toLocaleString('pt-BR'):'—';
const statusLabel=(value?:string|null)=>{
  const v=(value||'').toLowerCase();
  if(v==='signed') return 'Assinado';
  if(v==='sent') return 'Enviado';
  if(v==='viewed') return 'Visualizado';
  if(v==='draft') return 'Rascunho';
  if(v==='cancelled'||v==='canceled') return 'Cancelado';
  return value||'Registrado';
};

export default function Signatures(){
  const [rows,setRows]=useState<SignatureRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');

  useEffect(()=>{(async()=>{
    if(!supabase){setLoading(false);return;}
    const {data,error}=await supabase
      .from('signature_requests')
      .select('id,title,status,signer_name,created_at,sent_at,signed_at,provider')
      .order('created_at',{ascending:false})
      .limit(200);
    if(error) setNotice(error.message);
    setRows((data||[]) as SignatureRow[]);
    setLoading(false);
  })()},[]);

  const stats=useMemo(()=>({
    total:rows.length,
    signed:rows.filter(r=>(r.status||'').toLowerCase()==='signed').length,
    waiting:rows.filter(r=>['sent','viewed'].includes((r.status||'').toLowerCase())).length,
  }),[rows]);

  return <div className="module signatures-page">
    <div className="page-head">
      <div>
        <h1>Assinaturas</h1>
        <p>O fluxo anterior foi desativado. Esta área está preparada para a nova API de assinatura contratada pelo escritório.</p>
      </div>
    </div>

    <div className="system-bar">
      <span><ShieldCheck size={14}/> NOVA INTEGRAÇÃO DE ASSINATURAS</span>
      <span className="online">● AGUARDANDO CONFIGURAÇÃO DA NOVA API</span>
    </div>

    <div className="cards signature-stats">
      <div className="card"><FileText size={20}/><strong>{stats.total}</strong><span>Registros preservados</span></div>
      <div className="card"><Clock3 size={20}/><strong>{stats.waiting}</strong><span>Registros antigos em andamento</span></div>
      <div className="card"><FileCheck2 size={20}/><strong>{stats.signed}</strong><span>Documentos já assinados</span></div>
    </div>

    <div className="integration-panel">
      <div className="integration-head">
        <div>
          <span className="integration-pill">NOVA API</span>
          <h2>Integração pronta para ser configurada</h2>
          <p>Documenso, biometria própria, página pública de captura e ponte local não são mais acionados por esta tela. Os documentos e históricos anteriores foram preservados para não haver perda de dados.</p>
        </div>
        <div className="integration-icon"><Plug size={22}/></div>
      </div>
      <div className="integration-notice">Envios novos estão bloqueados até conectarmos a API contratada.</div>
    </div>

    <div className="integration-panel">
      <div className="integration-head"><div><h2>Histórico preservado</h2><p>Somente leitura enquanto a nova integração é implantada.</p></div></div>
      {loading?<div className="empty">Carregando registros…</div>:rows.length===0?<div className="empty">Nenhum registro de assinatura.</div>:<div className="table-wrap"><table><thead><tr><th>Documento</th><th>Destinatário</th><th>Status</th><th>Provedor anterior</th><th>Criado</th><th>Assinado</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.title||'Documento'}</strong></td><td>{r.signer_name||'—'}</td><td>{statusLabel(r.status)}</td><td>{r.provider||'—'}</td><td>{ptDate(r.created_at)}</td><td>{ptDate(r.signed_at)}</td></tr>)}</tbody></table></div>}
      {notice&&<div className="integration-notice">{notice}</div>}
    </div>
  </div>;
}
