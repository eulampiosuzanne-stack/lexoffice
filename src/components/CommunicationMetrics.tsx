import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Metrics = {
  received: number;
  response_samples: number;
  average_response_seconds: number | null;
  awaiting_human: number;
  awaiting_automation: number;
  watchdog_paused: number;
  blocked_attempts: number;
  provider_failures: number;
};

export default function CommunicationMetrics() {
  const [days, setDays] = useState(7);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await supabase?.functions.invoke('sf-care-review', { body: { action: 'metrics', days } });
        if (response?.error || !response?.data?.ok) throw new Error();
        if (active) {
          setMetrics(response.data.metrics);
          setFailed(false);
        }
      } catch {
        if (active) {
          setMetrics(null);
          setFailed(true);
        }
      }
    }
    setMetrics(null);
    setFailed(false);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [days]);

  const figures = metrics && [
    ['Conversas com entrada', metrics.received],
    ['Aguardando automação', metrics.awaiting_automation],
    ['Aguardando equipe', metrics.awaiting_human],
    ['Pausadas pelo Vigia', metrics.watchdog_paused],
    ['Tentativas bloqueadas', metrics.blocked_attempts],
    ['Falhas do provedor', metrics.provider_failures],
    ['Primeira resposta média', metrics.average_response_seconds === null
      ? 'Sem amostra' : `${(metrics.average_response_seconds / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`],
  ];

  const recommendations = metrics ? [
    metrics.provider_failures > 0 && ['Revisar falhas de envio', 'Há tentativas com erro no provedor. Conferir o motivo antes de reenviar reduz o risco de duplicidade.'],
    metrics.awaiting_automation > 0 && ['Revisar conversas sem resposta', 'A última mensagem registrada foi do cliente. Conferir o webhook e o roteamento ajuda a localizar onde o atendimento parou.'],
    metrics.watchdog_paused > 0 && ['Investigar pausas do Vigia', 'Há conversas com bloqueio de segurança. Revisar a sequência de eventos ajuda a confirmar a causa antes de liberar o atendimento.'],
  ].filter((item): item is string[] => Array.isArray(item)) : [];

  return <section className="ac-surface">
    <div className="ac-section-head">
      <h2>Inteligência do atendimento</h2>
      <label>Período <select value={days} onChange={event => setDays(Number(event.target.value))}>
        <option value={1}>Últimas 24 horas</option>
        <option value={7}>Últimos 7 dias</option>
        <option value={30}>Últimos 30 dias</option>
      </select></label>
    </div>
    {failed ? <p role="alert">Os indicadores estão indisponíveis.</p> :
      figures ? <div className="ac-metrics">{figures.map(([label, value]) =>
        <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div> : <p role="status">Carregando indicadores…</p>}
    {recommendations.length > 0 && <details className="ac-disclosure">
      <summary>Melhorias recomendadas</summary>
      <ul>{recommendations.map(([title, description]) =>
        <li key={title}><strong>{title}</strong><p>{description}</p></li>)}</ul>
    </details>}
    {metrics && <p>Tempo médio calculado em {metrics.response_samples} conversas com resposta registrada.</p>}
  </section>;
}
