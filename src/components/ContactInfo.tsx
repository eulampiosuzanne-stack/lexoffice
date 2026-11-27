import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const ARCHIVED = 'arquivada';
// Marcadores com ":" são internos da LEX; os demais são os da Dra.
export const userTags = (tags?: string[]) => (tags || []).filter(t => !t.includes(':') && t !== ARCHIVED && t !== 'follow_up');

type Props = {
  orgId: string; conversationId: string; name: string; phone: string; tags: string[];
  botOnly: boolean; busy: boolean; onToggleBot: () => void; onTags: (tags: string[]) => void;
};

export default function ContactInfo({ orgId, conversationId, name, phone, tags, botOnly, busy, onToggleBot, onTags }: Props) {
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [responsible, setResponsible] = useState('');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState('');
  const [tag, setTag] = useState('');
  const [notice, setNotice] = useState('');
  const [office, setOffice] = useState('');
  const [since, setSince] = useState('');

  useEffect(() => {
    let live = true;
    setNotice(''); setResponsible(''); setNotes(''); setSaved(''); setTag(''); setOffice(''); setSince('');
    (async () => {
      const [p, c] = await Promise.all([
        supabase!.from('profiles').select('id,name').eq('org_id', orgId).order('name'),
        supabase!.from('whatsapp_conversations').select('responsible_id,internal_notes,created_at,connection:whatsapp_connections(display_phone_number,display_name)').eq('id', conversationId).maybeSingle(),
      ]);
      if (!live) return;
      setPeople((p.data || []) as any);
      setResponsible(c.data?.responsible_id || ''); setNotes(c.data?.internal_notes || ''); setSaved(c.data?.internal_notes || '');
      const line: any = c.data?.connection;
      setOffice(line?.display_phone_number || line?.display_name || '');
      setSince(c.data?.created_at ? new Date(c.data.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
    })();
    return () => { live = false; };
  }, [orgId, conversationId]);

  async function save(change: Record<string, unknown>) {
    setNotice('');
    const { data, error } = await supabase!.from('whatsapp_conversations').update({ ...change, updated_at: new Date().toISOString() }).eq('id', conversationId).select('id');
    if (error || !data?.length) { setNotice('Não foi possível salvar. Confira se esta conversa é sua.'); return false; }
    setNotice('Salvo.');
    return true;
  }
  const saveTags = async (next: string[]) => { if (await save({ tags: next })) onTags(next); };
  const addTag = () => { const t = tag.trim().replace(/:/g, '-').slice(0, 30); if (!t) return; setTag(''); if (!tags.includes(t)) void saveTags([...tags, t]); };
  const archived = tags.includes(ARCHIVED);

  return (
    <div className="contact-info">
      <div className="ci-row"><span>Nome</span><b>{name}</b></div>
      <div className="ci-row"><span>Número</span><b>{phone || 'Sem telefone'}</b></div>
      <div className="ci-row"><span>Chatbot</span>
        <button type="button" className={`ci-switch ${botOnly ? 'on' : ''}`} aria-pressed={botOnly} disabled={busy || !phone} onClick={onToggleBot}>{botOnly ? 'Sim' : 'Não'}</button>
      </div>
      <div className="ci-row"><span>Arquivar</span>
        <button type="button" className={`ci-switch ${archived ? 'on' : ''}`} aria-pressed={archived} onClick={() => void saveTags(archived ? tags.filter(t => t !== ARCHIVED) : [...tags, ARCHIVED])}>{archived ? 'Sim' : 'Não'}</button>
      </div>
      <label>Responsável
        <select value={responsible} onChange={async e => { const v = e.target.value; if (await save({ responsible_id: v || null })) setResponsible(v); }}>
          <option value="">Ninguém</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>Tags
        <div className="ci-tags">
          {userTags(tags).map(t => <button type="button" key={t} title="Remover tag" onClick={() => void saveTags(tags.filter(x => x !== t))}>{t} ×</button>)}
        </div>
        <div className="ci-add">
          <input value={tag} onChange={e => setTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Nova tag" />
          <button type="button" onClick={addTag} disabled={!tag.trim()}>+</button>
        </div>
      </label>
      <label>Anotações
        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} onBlur={async () => { if (notes !== saved && await save({ internal_notes: notes })) setSaved(notes); }} placeholder="Só a equipe vê" />
      </label>
      {office && <div className="ci-row"><span>Aparelho de origem</span><b>{office}</b></div>}
      <div className="ci-row"><span>Data de cadastro</span><b>{since || '—'}</b></div>
      {notice && <small role="status">{notice}</small>}
    </div>
  );
}
