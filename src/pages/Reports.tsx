import { useEffect, useState } from 'react';
import { RefreshCw, Users, CircleDollarSign, Gavel, MessageCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './subtabs.css';

type Periodo = 'mes' | 'mes_passado' | '90d' | 'ano';
const NOMES: Record<Periodo, string> = { mes: 'Este mês', mes_passado: 'Mês passado', '90d': 'Últimos 90 dias', ano: 'Este ano' };
const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(v) ? v : 0);
const pct = (v: number) => `${(Number.isFinite(v) ? v * 100 : 0).toFixed(0)}%`;

export function intervalo(p: Periodo, agora = new Date()): { de: Date; ate: Date } {
  const y = agora.getFullYear(), m = agora.getMonth();
  if (p === 'mes') return { de: new Date(y, m, 1), ate: new Date(y, m + 1, 1) };
  if (p === 'mes_passado') return { de: new Date(y, m - 1, 1), ate: new Date(y, m, 1) };
  if (p === 'ano') return { de: new Date(y, 0, 1), ate: new Date(y + 1, 0, 1) };
  return { de: new Date(agora.getTime() - 90 * 86400000), ate: new Date(agora.getTime() + 1000) };
}
const CONTRATADO = ['contratado', 'cliente'];

type Dados = {
  leadsNovos: number; leadsContratados: number; origens: [string, number][];
  recebido: number; aReceberPeriodo: number; vencidoAberto: number; qtdVencidas: number;
  andamentos: number; audiencias: number; prazos: number; prazosConcluidos: number; processosNovos: number;
  msgRecebidas: number; msgEnviadas: number; alertas: number; semWhatsApp: number;
};

export default function Reports() {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  async function load(p = periodo) {
    if (!supabase) return;
    setLoading(true); setErro('');
    const { de, ate } = intervalo(p);
    const a = de.toISOString(), b = ate.toISOString(), dA = a.slice(0, 10), dB = b.slice(0, 10), hoje = new Date().toISOString().slice(0, 10);
    const cnt = (q: any) => q.then((r: any) => (r.error ? 0 : r.count || 0));
    try {
      const sb = supabase;
      const [leads, pagamentos, aReceber, vencidas, andamentos, audiencias, prazos, prazosOk, processosNovos, msgIn, msgOut, alertas, clientesProc] = await Promise.all([
        sb.from('leads').select('stage_key,origin').gte('created_at', a).lt('created_at', b).limit(5000),
        sb.from('financial_entry_payments').select('amount').gte('paid_at', a).lt('paid_at', b).limit(5000),
        sb.from('financial_entries').select('amount').eq('type', 'income').gte('due_date', dA).lt('due_date', dB).neq('status', 'paid').limit(5000),
        sb.from('financial_entries').select('amount').eq('type', 'income').lt('due_date', hoje).not('status', 'in', '(paid,cancelled)').limit(5000),
        cnt(sb.from('process_movements').select('id', { count: 'exact', head: true }).gte('created_at', a).lt('created_at', b)),
        cnt(sb.from('process_hearings').select('id', { count: 'exact', head: true }).gte('starts_at', a).lt('starts_at', b)),
        cnt(sb.from('process_deadlines').select('id', { count: 'exact', head: true }).gte('due_at', a).lt('due_at', b)),
        cnt(sb.from('process_deadlines').select('id', { count: 'exact', head: true }).gte('due_at', a).lt('due_at', b).not('completed_at', 'is', null)),
        cnt(sb.from('processes').select('id', { count: 'exact', head: true }).gte('created_at', a).lt('created_at', b)),
        cnt(sb.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('direction', 'inbound').gte('created_at', a).lt('created_at', b)),
        cnt(sb.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound').gte('created_at', a).lt('created_at', b)),
        cnt(sb.from('ai_agent_alerts').select('id', { count: 'exact', head: true }).neq('agent_key', 'system').gte('created_at', a).lt('created_at', b)),
        sb.from('processes').select('client_id,clients!inner(id,phone,whatsapp)').not('client_id', 'is', null).limit(3000),
      ]);
      const L = (leads.data || []) as any[];
      const origens = Object.entries(L.reduce((acc: Record<string, number>, x) => { const k = String(x.origin || 'não informada').toLowerCase(); acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 5) as [string, number][];
      const soma = (r: any) => ((r.data || []) as any[]).reduce((s, x) => s + Number(x.amount || 0), 0);
      const sem = new Set<string>();
      for (const p0 of (clientesProc.data || []) as any[]) { const c = Array.isArray(p0.clients) ? p0.clients[0] : p0.clients; if (c && !String(c.whatsapp || '').trim() && !String(c.phone || '').trim()) sem.add(c.id); }
      setD({
        leadsNovos: L.length, leadsContratados: L.filter((x) => CONTRATADO.includes(String(x.stage_key))).length, origens,
        recebido: soma(pagamentos), aReceberPeriodo: soma(aReceber), vencidoAberto: soma(vencidas), qtdVencidas: (vencidas.data || []).length,
        andamentos, audiencias, prazos, prazosConcluidos: prazosOk, processosNovos,
        msgRecebidas: msgIn, msgEnviadas: msgOut, alertas, semWhatsApp: sem.size,
      });
    } catch {
      setErro('Não foi possível montar o relatório agora. Tente atualizar.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(periodo); }, [periodo]);

  const Card = ({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) => <div className="report-card"><div className="report-card-head"><span>{titulo}</span></div><strong>{loading ? '—' : valor}</strong>{sub && <small style={{ display: 'block', color: '#BDB4A6', marginTop: 4 }}>{loading ? '' : sub}</small>}</div>;
  const Secao = ({ icon: I, titulo, children }: any) => <section className="integration-panel" style={{ marginBottom: 14 }}><h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><I size={17} />{titulo}</h3><div className="report-grid">{children}</div></section>;

  return <div className="module">
    <div className="page-head"><div><h1>Relatórios</h1><p>Como o escritório foi no período: clientes novos, dinheiro, processos e atendimento.</p></div><button className="secondary" onClick={() => load()} disabled={loading}>{loading ? <Loader2 size={15} /> : <RefreshCw size={15} />}Atualizar</button></div>
    <div className="lx-subtabs" role="tablist" aria-label="Período do relatório">{(Object.keys(NOMES) as Periodo[]).map((k) => <button key={k} type="button" role="tab" aria-selected={periodo === k} className={periodo === k ? 'active' : ''} onClick={() => setPeriodo(k)}>{NOMES[k]}</button>)}</div>
    {erro && <div className="alert error" role="alert">{erro}</div>}
    {d && <>
      <Secao icon={Users} titulo="Comercial">
        <Card titulo="Leads novos" valor={String(d.leadsNovos)} />
        <Card titulo="Viraram clientes" valor={String(d.leadsContratados)} sub={d.leadsNovos ? `Conversão de ${pct(d.leadsContratados / d.leadsNovos)}` : 'Sem leads no período'} />
        <Card titulo="De onde vieram" valor={d.origens[0]?.[0] || '—'} sub={d.origens.map(([o, n]) => `${o}: ${n}`).join(' · ')} />
      </Secao>
      <Secao icon={CircleDollarSign} titulo="Financeiro">
        <Card titulo="Recebido no período" valor={money(d.recebido)} />
        <Card titulo="A receber no período" valor={money(d.aReceberPeriodo)} sub="Parcelas com vencimento no período ainda em aberto" />
        <Card titulo="Em atraso hoje" valor={money(d.vencidoAberto)} sub={`${d.qtdVencidas} parcela(s) vencida(s) em aberto`} />
      </Secao>
      <Secao icon={Gavel} titulo="Processos">
        <Card titulo="Processos novos" valor={String(d.processosNovos)} />
        <Card titulo="Andamentos capturados" valor={String(d.andamentos)} />
        <Card titulo="Audiências" valor={String(d.audiencias)} />
        <Card titulo="Prazos" valor={String(d.prazos)} sub={`${d.prazosConcluidos} concluído(s)`} />
      </Secao>
      <Secao icon={MessageCircle} titulo="Atendimento">
        <Card titulo="Mensagens recebidas" valor={String(d.msgRecebidas)} />
        <Card titulo="Mensagens enviadas" valor={String(d.msgEnviadas)} />
        <Card titulo="Alertas para a Dra." valor={String(d.alertas)} />
      </Secao>
      {d.semWhatsApp > 0 && <section className="integration-panel" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle size={17} color="#F2C56D" /><span><b>{d.semWhatsApp} cliente(s) com processo sem WhatsApp.</b> Complete na aba Clientes para os avisos chegarem.</span></section>}
    </>}
  </div>;
}
