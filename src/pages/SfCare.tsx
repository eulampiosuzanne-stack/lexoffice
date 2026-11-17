// SF Care (17/11/2026): agente proativo que avisa o cliente quando a ação é ajuizada.
// A tela mostra se ele está ligado, permite ligar/desligar (Dra. e advogadas) e lista os avisos.
// Dados vêm das funções do banco sf_care_panel() e sf_care_set_enabled() — a tabela em si não é exposta.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Item = { id: string; created_at: string; sent_at?: string | null; status: 'sent' | 'queued' | 'failed'; error?: string | null; client?: string | null; cnj?: string | null; message?: string | null };
type Panel = { enabled: boolean; started_at?: string | null; items: Item[] };

const fmt = (v?: string | null) => (v ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(v)) : '—');
const label = { sent: 'Enviado', queued: 'Na fila', failed: 'Não enviado' } as const;
const color = { sent: '#1f7a4d', queued: '#8a6d1f', failed: '#a3282f' } as const;

export default function SfCare() {
  const [data, setData] = useState<Panel | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    if (!supabase) { setError('Serviço de dados indisponível.'); return; }
    setError('');
    const { data: res, error: e } = await supabase.rpc('sf_care_panel');
    if (e) { setError(e.message.includes('not_authorized') ? 'Seu acesso não permite ver o SF Care.' : 'Não foi possível carregar o SF Care.'); return; }
    setData(res as Panel);
  }
  useEffect(() => { void load(); }, []);

  async function toggle() {
    if (!supabase || !data) return;
    const next = !data.enabled;
    if (!next && !window.confirm('Desligar o SF Care? Os clientes deixam de receber o aviso de ação ajuizada.')) return;
    setBusy(true); setError('');
    const { error: e } = await supabase.rpc('sf_care_set_enabled', { p_enabled: next });
    setBusy(false);
    if (e) { setError(e.message.includes('not_authorized') ? 'Somente a Dra. ou advogadas podem ligar ou desligar o SF Care.' : 'Não foi possível alterar o SF Care.'); return; }
    await load();
  }

  const items = data?.items || [];
  const sent = items.filter((i) => i.status === 'sent').length;

  return (
    <section className="workspace-page">
      <div className="page-head">
        <div>
          <h1>SF Care</h1>
          <p>Agente proativo que avisa o cliente pelo WhatsApp quando a ação dele é ajuizada.</p>
        </div>
      </div>

      {error && <p className="integration-notice" role="alert">{error}</p>}

      <div className="workspace-hub">
        <article className="workspace-hub-card">
          <small>Situação</small>
          <h2 style={{ color: data?.enabled ? color.sent : color.failed }}>{data ? (data.enabled ? 'Ligado' : 'Desligado') : 'Carregando…'}</h2>
          <p>{data?.enabled ? `Avisando processos cadastrados desde ${fmt(data.started_at)}.` : 'Nenhum aviso de ajuizamento está sendo enviado.'}</p>
          {data && <button type="button" className={data.enabled ? 'btn-secondary' : 'primary'} onClick={toggle} disabled={busy} style={{ marginTop: 12, minHeight: 44 }}>{busy ? 'Salvando…' : data.enabled ? 'Desligar SF Care' : 'Ligar SF Care'}</button>}
        </article>
        <article className="workspace-hub-card">
          <small>Como funciona</small>
          <h2>Ação ajuizada</h2>
          <p>A cada 10 minutos ele confere os processos novos de clientes com número CNJ válido e manda o aviso em horário comercial. Processos antigos, de parceria, encerrados ou de clientes que recusaram avisos ficam de fora.</p>
        </article>
        <article className="workspace-hub-card">
          <small>Resultado</small>
          <h2>{sent} aviso{sent === 1 ? '' : 's'} enviado{sent === 1 ? '' : 's'}</h2>
          <p>{items.length - sent} na fila ou não enviados. A senhora também recebe cada envio no sininho da LEX.</p>
        </article>
      </div>

      <div className="workspace-panel">
        <div className="workspace-heading"><h2>Avisos do SF Care</h2><button type="button" className="btn-secondary" onClick={() => void load()}>Atualizar</button></div>
        {data && items.length === 0 && <p className="empty">Nenhum aviso ainda. O primeiro sai quando um processo novo de cliente for cadastrado.</p>}
        <div className="workspace-record-list">
          {items.map((i) => (
            <div key={i.id} className="workspace-list-row">
              <div style={{ minWidth: 0 }}>
                <strong>{i.client || 'Cliente'}</strong><br />
                <small>{i.cnj || 'Processo'} · {fmt(i.sent_at || i.created_at)}</small>
                {i.status === 'failed' && i.error && <><br /><small style={{ color: color.failed }}>{i.error}</small></>}
                {open === i.id && i.message && <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', fontSize: 14, margin: '12px 0 0' }}>{i.message}</pre>}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <strong style={{ color: color[i.status] }}>{label[i.status]}</strong>
                <button type="button" className="btn-secondary" onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? 'Ocultar' : 'Ver mensagem'}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
