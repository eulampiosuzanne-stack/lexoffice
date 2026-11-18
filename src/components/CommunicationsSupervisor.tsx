import CommunicationMetrics from './CommunicationMetrics';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Pending = { id: string; event_kind: string; message: string; source_verified: boolean; created_at: string; process_id: string | null; client_id: string };
type Audit = { id: string; agent_key: string; allowed: boolean; reason: string; created_at: string };

export default function CommunicationsSupervisor() {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const response = await supabase?.functions.invoke('sf-care-review', { body: { action: 'list' } });
      if (response?.error || !response?.data?.ok) throw new Error();
      setQueue(response.data.queue);
      setAudit(response.data.audit);
    } catch {
      setError('Não foi possível consultar as comunicações. Confira se sua sessão tem permissão para revisão.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function review(item: Pending, decision: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const edited = drafts[item.id]?.trim();
      const response = await supabase?.functions.invoke('sf-care-review', {
        body: { id: item.id, decision, ...(decision === 'approve' && edited !== undefined ? { message: edited } : {}) },
      });
      if (response?.error || !response?.data?.ok) throw new Error();
      setQueue(items => items.filter(entry => entry.id !== item.id));
      setNotice(decision === 'approve' ? 'Comunicação aprovada para a fila de envio.' : 'Comunicação rejeitada.');
    } catch {
      setError('Não foi possível registrar a decisão. Atualize a fila antes de tentar novamente.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <CommunicationMetrics />
    <section className="ac-surface" aria-busy={busy}>
      <div className="ac-section-head">
        <h2>Aguardando aprovação</h2>
        <button className="secondary" disabled={busy} onClick={() => void load()}>Atualizar</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!queue.length && !busy && !error && <p>Nenhuma comunicação pendente nesta fila.</p>}
      {queue.map(item => <details key={item.id} className="ac-disclosure">
        <summary>{item.event_kind.replace(/_/g, ' ')} · {new Date(item.created_at).toLocaleDateString('pt-BR')}</summary>
        <p>{item.source_verified ? 'Fonte verificada' : 'Fonte pendente de verificação'}</p>
        <p>Cliente {item.client_id}{item.process_id && <> · Processo {item.process_id}</>}</p>
        <label>Mensagem<textarea rows={4} maxLength={2000} value={drafts[item.id] ?? item.message}
          onChange={event => setDrafts(previous => ({ ...previous, [item.id]: event.target.value }))} /></label>
        <div className="ac-section-head">
          <button className="secondary" disabled={busy} onClick={() => void review(item, 'reject')}>Rejeitar</button>
          <button className="primary" disabled={busy || !item.source_verified || !(drafts[item.id] ?? item.message).trim()}
            onClick={() => void review(item, 'approve')}>Aprovar comunicação</button>
        </div>
      </details>)}
    </section>
    <section className="ac-surface">
      <h2>Auditoria recente de envios</h2>
      {audit.length ? <ul>{audit.map(entry => <li key={entry.id}>
        <strong>{entry.agent_key}</strong> · {entry.allowed ? 'Aceito pelo provedor' : 'Retido ou com falha'} · {entry.reason}
        {' · '}{new Date(entry.created_at).toLocaleString('pt-BR')}
      </li>)}</ul> : !busy && !error && <p>Nenhum registro retornado.</p>}
    </section>
  </>;
}
