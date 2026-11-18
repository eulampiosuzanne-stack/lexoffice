import CommunicationMetrics from './CommunicationMetrics';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Pending = { id: string; event_kind: string; message: string; source_verified: boolean; created_at: string; process_id: string | null; client_id: string; client_name?: string | null; client_phone?: string | null; process_cnj?: string | null };

const KIND_LABELS: Record<string, string> = {
  relationship_checkin: 'Acompanhamento periódico',
  post_filing_checkin: 'Acompanhamento após ajuizamento',
  process_distributed: 'Aviso de ajuizamento',
  office_card: 'Card institucional',
  educational_card: 'Card educativo',
  satisfaction_poll: 'Pesquisa de satisfação',
  interest_poll: 'Enquete de interesses',
};
const ERROR_LABELS: Record<string, string> = {
  not_pending_or_not_found: 'esta mensagem já foi decidida. Clique em Atualizar.',
  concurrent_review: 'esta mensagem já foi decidida em outra tela. Clique em Atualizar.',
  source_not_verified: 'a origem ainda não foi verificada.',
  invalid_message: 'a mensagem está vazia ou passou de 2.000 caracteres.',
  not_authorized_to_review: 'seu usuário não tem permissão para aprovar.',
  invalid_session: 'sua sessão expirou. Entre novamente.',
};
const kindLabel = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, ' ');
const errorLabel = (e: string) => ERROR_LABELS[e] ?? e;
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
      if (response?.error || !response?.data?.ok) throw new Error(String(response?.data?.error || response?.error?.message || 'Falha ao consultar a fila'));
      setQueue(response.data.queue);
      setAudit(response.data.audit);
    } catch (err) {
      setError('Não foi possível consultar as comunicações: ' + (err instanceof Error ? err.message : 'verifique suas permissões.'));
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
      if (response?.error || !response?.data?.ok) throw new Error(errorLabel(String(response?.data?.error || response?.error?.message || 'Falha na aprovação')));
      setQueue(items => items.filter(entry => entry.id !== item.id));
      setNotice(decision === 'approve' ? 'Comunicação aprovada para a fila de envio.' : 'Comunicação rejeitada.');
    } catch (err) {
      setError('Não foi possível registrar a decisão: ' + (err instanceof Error ? err.message : 'atualize a fila e tente novamente.'));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <CommunicationMetrics />
    <section className="ac-surface" aria-busy={busy} style={{ paddingBottom: 120 }}>
      <div className="ac-section-head">
        <h2>Aguardando aprovação{queue.length ? ` (${queue.length})` : ''}</h2>
        <button className="secondary" disabled={busy} onClick={() => void load()}>Atualizar</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!queue.length && !busy && !error && <p>Nenhuma comunicação pendente nesta fila.</p>}
      {queue.map(item => <article key={item.id} className="ac-disclosure" aria-label={'Mensagem para ' + (item.client_name || 'cliente')}>
        <h3>{item.client_name || 'Cliente sem nome cadastrado'}{item.client_phone && <small> · WhatsApp {item.client_phone}</small>}</h3>
        <p>{kindLabel(item.event_kind)} · {new Date(item.created_at).toLocaleDateString('pt-BR')}{item.process_cnj && <> · Processo {item.process_cnj}</>}</p>
        {!item.source_verified && <p>Aprovação bloqueada: a origem desta comunicação ainda não foi verificada. É necessário validar a fonte antes de autorizar.</p>}
        <label>Mensagem<textarea rows={4} maxLength={2000} value={drafts[item.id] ?? item.message}
          onChange={event => setDrafts(previous => ({ ...previous, [item.id]: event.target.value }))} /></label>
        <div className="ac-section-head">
          <button className="primary" disabled={busy || !item.source_verified || !(drafts[item.id] ?? item.message).trim()}
            onClick={() => void review(item, 'approve')}>{item.source_verified ? 'Autorizar comunicação' : 'Aguardando verificação'}</button>
          <button className="secondary" disabled={busy} onClick={() => void review(item, 'reject')}>Rejeitar</button>
        </div>
      </article>)}
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
