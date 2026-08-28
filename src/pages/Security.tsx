import { useEffect,useState } from 'react';
import { ShieldCheck,RefreshCw,LockKeyhole,Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Security(){
  const [logs,setLogs]=useState<any[]>([]),[loading,setLoading]=useState(true);
  async function load(){
    if(!supabase)return;
    setLoading(true);
    const {data}=await supabase.from('audit_logs').select('id,action,entity,entity_id,metadata,created_at,user_id').order('created_at',{ascending:false}).limit(100);
    setLogs(data||[]);setLoading(false);
  }
  useEffect(()=>{load()},[]);
  return <div className="module"><div className="page-head"><div><h1>Segurança</h1><p>Auditoria, rastreabilidade e proteção operacional</p></div><button className="secondary" onClick={load}><RefreshCw size={15}/>Atualizar</button></div>
    <div className="cards security-cards"><div className="card"><div className="card-icon"><ShieldCheck size={18}/></div><strong>RLS</strong><span>Isolamento de dados ativo no banco</span></div><div className="card"><div className="card-icon"><LockKeyhole size={18}/></div><strong>AUTH</strong><span>Autenticação centralizada pelo Supabase</span></div><div className="card"><div className="card-icon"><Activity size={18}/></div><strong>{logs.length}</strong><span>Eventos recentes de auditoria</span></div></div>
    <div className="table-panel"><div className="page-head"><div><h3>Trilha de auditoria</h3><p>Últimas ações registradas no ecossistema</p></div></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Ação</th><th>Entidade</th><th>Usuário</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td>{new Date(l.created_at).toLocaleString('pt-BR')}</td><td><b>{l.action||'—'}</b></td><td>{l.entity||'—'}</td><td><small>{l.user_id||'sistema'}</small></td></tr>)}</tbody></table>{!loading&&!logs.length&&<div className="empty">Nenhum evento de auditoria encontrado.</div>}{loading&&<div className="empty">Carregando auditoria...</div>}</div></div>
  </div>
}
