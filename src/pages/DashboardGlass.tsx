import { useEffect, useState, type CSSProperties } from 'react';
import { Activity, Bell, Bot, CalendarDays, Clock3, Gavel, MessageCircle, Plus, Scale, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Movement = {
  id: string;
  process_id?: string;
  movement_date?: string;
  title?: string;
  processes?: { cnj_number?: string; internal_number?: string; clients?: { name?: string } };
};

const stages = [
  ['novo_lead', 'Novos'], ['contato_iniciado', 'Contato'], ['qualificacao', 'Qualificação'],
  ['consultoria', 'Consultoria'], ['proposta', 'Proposta'], ['negociacao', 'Negociação'],
  ['contratado', 'Contratado'], ['cliente', 'Cliente'],
] as const;

export default function DashboardGlass() {
  const [office, setOffice] = useState('Seu escritório');
  const [counts, setCounts] = useState({ processes: '—', leads: '—', clients: '—', deadlines: '—' });
  const [movements, setMovements] = useState<Movement[]>([]);
  const [leadStages, setLeadStages] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from('profiles').select('org_id,name').eq('id', user.id).maybeSingle()
        : { data: null };
      const orgId = profile?.org_id || null;
      const [processes, leads, clients, deadlines, recent, leadRows] = await Promise.all([
        supabase.from('processes').select('*', { count: 'exact', head: true }),
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('process_deadlines').select('*', { count: 'exact', head: true }),
        supabase.from('process_movements').select('id,process_id,movement_date,title,processes(cnj_number,internal_number,clients(name))').order('movement_date', { ascending: false }).limit(5),
        orgId ? supabase.from('leads').select('stage_key').eq('org_id', orgId) : supabase.from('leads').select('stage_key').limit(0),
      ]);
      if (!active) return;
      setOffice(profile?.name ? `Escritório ${profile.name}` : 'Seu escritório');
      setCounts({
        processes: String(processes.count ?? '—'), leads: String(leads.count ?? '—'),
        clients: String(clients.count ?? '—'), deadlines: String(deadlines.count ?? '—'),
      });
      setMovements((recent.data || []) as unknown as Movement[]);
      setLeadStages((leadRows.data || []).reduce<Record<string, number>>((map, row: any) => {
        map[row.stage_key || 'novo_lead'] = (map[row.stage_key || 'novo_lead'] || 0) + 1;
        return map;
      }, {}));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const stageMax = Math.max(1, ...Object.values(leadStages));
  const kpis = [
    { label: 'Processos ativos', value: counts.processes, icon: Gavel },
    { label: 'Novos leads', value: counts.leads, icon: Users },
    { label: 'Clientes cadastrados', value: counts.clients, icon: Scale },
    { label: 'Prazos monitorados', value: counts.deadlines, icon: Clock3 },
  ];

  return <div className="glass-dashboard">
    <header className="glass-dashboard-head">
      <div><small>LEXOFFICE</small><h1>Visão Geral <span>· {office}</span></h1></div>
      <div className="glass-dashboard-actions"><button aria-label="Notificações"><Bell size={17}/></button><a href="/atendimento"><Plus size={15}/> Novo atendimento</a></div>
    </header>

    <section className="glass-kpis" aria-label="Indicadores do escritório">
      {kpis.map(({ label, value, icon: Icon }) => <article className="glass-card glass-kpi" key={label}>
        <small><Icon size={14}/> {label}</small><strong>{loading ? '…' : value}</strong><span>Dados atualizados em tempo real</span>
      </article>)}
    </section>

    <section className="glass-dashboard-grid">
      <article className="glass-card glass-chart-panel">
        <div className="glass-panel-title"><h2>Pipeline de atendimento</h2><span>Tempo real</span></div>
        <div className="glass-bars">{stages.map(([key, label]) => {
          const value = leadStages[key] || 0;
          return <div className="glass-bar-item" key={key} title={`${label}: ${value}`}><i style={{ height: `${Math.max(8, value / stageMax * 100)}%` }}/><small>{label}</small></div>;
        })}</div>
      </article>

      <article className="glass-card glass-status-panel">
        <div className="glass-panel-title"><h2>Operação jurídica</h2><span>Hoje</span></div>
        <div className="glass-ring" style={{ '--ring-value': `${Math.min(100, Number(counts.processes) || 0)}%` } as CSSProperties}><b>{counts.processes}</b><small>processos</small></div>
        <ul><li><i className="wine"/> Processos ativos <b>{counts.processes}</b></li><li><i className="blue"/> Clientes <b>{counts.clients}</b></li><li><i/> Prazos <b>{counts.deadlines}</b></li></ul>
      </article>
    </section>

    <section className="glass-dashboard-grid glass-bottom-grid">
      <article className="glass-card glass-list-panel">
        <div className="glass-panel-title"><h2>Atividades recentes</h2><a href="/andamentos">Ver todas</a></div>
        {movements.length ? <div className="glass-activity-list">{movements.map(item => <a href={`/processos?processo=${item.process_id || ''}`} key={item.id}>
          <Activity size={16}/><span><b>{item.title || 'Movimentação processual'}</b><small>{item.processes?.clients?.name || item.processes?.cnj_number || 'Processo monitorado'}</small></span><time>{item.movement_date ? new Date(item.movement_date).toLocaleDateString('pt-BR') : '—'}</time>
        </a>)}</div> : <div className="glass-empty"><MessageCircle/><b>Nenhuma atividade recente</b><small>As novas movimentações aparecerão aqui.</small></div>}
      </article>

      <article className="glass-card glass-list-panel">
        <div className="glass-panel-title"><h2>Central inteligente</h2><span>LEX IA</span></div>
        <div className="glass-shortcuts"><a href="/agentes-ia"><Bot/><span><b>Agentes de IA</b><small>Configurar automações e atendimento</small></span></a><a href="/agenda"><CalendarDays/><span><b>Agenda jurídica</b><small>Consultar prazos e audiências</small></span></a><a href="/processos"><Gavel/><span><b>Processos</b><small>Acompanhar a operação do escritório</small></span></a></div>
      </article>
    </section>
  </div>;
}
