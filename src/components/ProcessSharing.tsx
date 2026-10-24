import { useEffect, useState } from 'react';
import { CalendarDays, LockKeyhole, Share2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './ProcessSharing.css';

type Person = { id: string; name: string; role_key: string };
type Grant = { user_id: string; permission: string };
const roles = ['lawyer', 'responsible_lawyer', 'owner', 'admin'];
const levels = [{ key: 'view', title: 'Visualizar', description: 'Consultar dados jurídicos' }, { key: 'edit', title: 'Editar', description: 'Colaborar na gestão jurídica' }, { key: 'manage', title: 'Gerenciar', description: 'Gerenciar eventos do processo' }];

export default function ProcessSharing({ processId, orgId, ownerId }: { processId: string; orgId?: string | null; ownerId?: string | null }) {
 const [open, setOpen] = useState(false);
 const [people, setPeople] = useState<Person[]>([]);
 const [grants, setGrants] = useState<Grant[]>([]);
 const [selected, setSelected] = useState('');
 const [permission, setPermission] = useState('view');
 const [busy, setBusy] = useState(false);
 const [notice, setNotice] = useState('');
 const [authorized, setAuthorized] = useState(false);
 useEffect(() => {
  let live = true;
  async function load() {
   if (!supabase || !orgId) return;
   const { data: auth } = await supabase.auth.getUser();
   const uid = auth.user?.id;
   if (!uid) return;
   const { data: actor } = await supabase.from('profiles').select('role_key,org_id').eq('id',uid).maybeSingle();
   if (!live || !actor || actor.org_id !== orgId) return;
   const canManage = ['owner', 'admin'].includes(actor.role_key) || (uid === ownerId && ['lawyer', 'responsible_lawyer'].includes(actor.role_key));
   setAuthorized(canManage);
   if (!canManage) return;
   const [members, access] = await Promise.all([
    supabase.from('profiles').select('id,name,role_key').eq('org_id',orgId).eq('status','active'),
    supabase.from('process_collaborators').select('user_id,permission').eq('process_id',processId)
   ]);
   if (!live) return;
   if (members.error || access.error) { setNotice('Não foi possível consultar os compartilhamentos.'); return; }
   setPeople(((members.data || []) as Person[]).filter(p => roles.includes(p.role_key) && p.id !== ownerId));
   setGrants((access.data || []) as Grant[]);
  }
  void load();
  return () => { live = false; };
 }, [orgId, ownerId, processId, open]);
 async function save(userId: string, level: string | null) {
  if (!supabase || busy) return;
  setBusy(true);setNotice('');
  try {
   const {error}=await supabase.rpc('manage_process_collaborator',{p_process_id:processId,p_user_id:userId,p_permission:level});
   if(error) throw error;
   const {data,error:loadError}=await supabase.from('process_collaborators').select('user_id,permission').eq('process_id',processId);
   if(loadError) throw loadError;
   setGrants((data||[]) as Grant[]);
   setNotice(level?'Acesso concedido com sucesso.':'Acesso revogado.');
  } catch(e) {setNotice(e instanceof Error?e.message:'Não foi possível atualizar o compartilhamento.');}
  finally {setBusy(false);}
 }
 if (!authorized) return null;
 return <div className="lex-share">
  <button className="secondary" type="button" onClick={() => setOpen(true)}><Share2 size={16}/> Compartilhar processo</button>
  {open && <div className="lex-share-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
   <section className="lex-share-dialog" role="dialog" aria-modal="true" aria-label="Compartilhar processo">
    <header><div><span className="lex-share-kicker">COLABORAÇÃO JURÍDICA</span><h2>Compartilhar processo</h2><p>Conceda acesso somente a advogados do mesmo escritório.</p></div><button type="button" className="secondary" onClick={() => setOpen(false)} aria-label="Fechar"><X size={18}/></button></header>
    <label>Advogado do escritório<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Selecione um profissional</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <div className="lex-share-levels">{levels.map(level => <label key={level.key} className={permission === level.key ? 'active' : ''}><input type="radio" name="process-share-level" value={level.key} checked={permission === level.key} onChange={() => setPermission(level.key)}/><strong>{level.title}</strong><small>{level.description}</small></label>)}</div>
    <button type="button" className="primary" disabled={!selected || busy} onClick={() => void save(selected,permission)}>Conceder acesso</button>
    <h3>Profissionais com acesso</h3>
    {grants.length === 0 ? <p className="lex-share-muted">Nenhum colaborador adicionado.</p> : grants.map(grant => <div className="lex-share-member" key={grant.user_id}><div><strong>{people.find(p => p.id === grant.user_id)?.name || 'Profissional'}</strong><small>Permissão: {levels.find(l => l.key === grant.permission)?.title || grant.permission}</small></div><button type="button" className="secondary" disabled={busy} onClick={() => void save(grant.user_id,null)}>Revogar</button></div>)}
    <div className="lex-share-note"><CalendarDays size={18}/><span>Eventos vinculados ao processo são acessíveis aos advogados autorizados nas agendas internas.</span></div>
    <div className="lex-share-note"><LockKeyhole size={18}/><span>Compartilhar não concede acesso ao financeiro.</span></div>
    {notice && <p role="status" className="lex-share-muted">{notice}</p>}
   </section>
  </div>}
 </div>;
}
