// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckSquare, ChevronRight, MessageCircle, Plus, Scale, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./dashboard-home.css";

type Row = Record<string, any>;
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const dt = (v?: string) => v ? new Date(v) : null;
const hour = (v?: string) => dt(v)?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) || "—";
const shortDate = (v?: string) => dt(v)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") || "—";
const saopauloDay = () => {
  const value = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { start: `${value}T00:00:00-03:00`, end: `${value}T23:59:59-03:00` };
};

export default function DashboardOverview() {
  const go = useNavigate();
  const [profile, setProfile] = useState<Row>({});
  const [finance, setFinance] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [deadlines, setDeadlines] = useState<Row[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { (async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = await supabase.from("profiles").select("org_id,name").eq("id", user.id).maybeSingle();
    setProfile(p || {});
    if (!p?.org_id) return;
    const { start, end } = saopauloDay();
    const [f, e, t, d, i] = await Promise.all([
      supabase.from("financial_entries").select("id,amount,status,paid_at,due_date,description").eq("org_id", p.org_id).eq("type", "income").limit(1000),
      supabase.from("calendar_events").select("id,title,description,starts_at,location,event_type,status").eq("org_id", p.org_id).gte("starts_at", start).lte("starts_at", end).neq("status", "cancelled").order("starts_at").limit(12),
      supabase.from("office_tasks").select("id,title,notes,priority,due_date,created_at").eq("org_id", p.org_id).eq("scope", "geral").is("done_at", null).order("due_date", { ascending: true, nullsFirst: false }).limit(8),
      supabase.from("process_deadlines").select("id,title,due_at,status,priority").eq("org_id", p.org_id).neq("status", "completed").order("due_at").limit(12),
      supabase.from("client_app_inbox").select("id", { count: "exact", head: true }).eq("org_id", p.org_id).is("read_at", null),
    ]);
    setFinance(f.data || []); setEvents(e.data || []); setTasks(t.data || []); setDeadlines(d.data || []); setUnread(i.count || 0); setLoaded(true);
  })().catch((error) => { console.error("Falha ao carregar painel", error); setLoaded(true); }); }, []);

  const pending = useMemo(() => finance.filter((x) => x.status !== "paid" && !x.paid_at), [finance]);
  const pendingAmount = useMemo(() => pending.reduce((sum, x) => sum + (Number(x.amount) || 0), 0), [pending]);
  const critical = useMemo(() => deadlines.filter((x) => {
    const due = dt(x.due_at); if (!due) return false;
    return due.getTime() <= Date.now() + 48 * 60 * 60 * 1000 || String(x.priority || "").toLowerCase() === "high";
  }), [deadlines]);
  const attentionCount = critical.length + (unread ? 1 : 0) + (pending.length ? 1 : 0);
  const firstName = String(profile.name || "").trim().split(/\s+/)[0];
  const greeting = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const priorityRows = [
    ...critical.slice(0, 2).map((x) => ({ icon: Scale, title: x.title || "Prazo processual", meta: `Vence ${shortDate(x.due_at)}`, path: "/processos", tone: "danger" })),
    ...(unread ? [{ icon: MessageCircle, title: `${unread} ${unread === 1 ? "mensagem aguarda" : "mensagens aguardam"} resposta`, meta: "Aplicativo do cliente", path: "/atendimento/aplicativo", tone: "info" }] : []),
    ...(pending.length ? [{ icon: Wallet, title: `${pending.length} ${pending.length === 1 ? "recebimento pendente" : "recebimentos pendentes"}`, meta: brl(pendingAmount), path: "/financeiro", tone: "gold" }] : []),
  ].slice(0, 4);

  return <div className="home-command">
    <header className="hc-greeting">
      <div><small>{today.charAt(0).toUpperCase() + today.slice(1)}</small><h1>{greeting}{firstName ? `, ${/^suzanne$/i.test(firstName) ? "Dra. Suzanne" : firstName}` : ""}</h1><p>Aqui está o que precisa da sua atenção hoje.</p></div>
      <button className="hc-primary" type="button" onClick={() => go("/whatsapp")}><MessageCircle size={18}/> Abrir conversas</button>
    </header>

    <section className="hc-metrics" aria-label="Resumo do dia">
      <button onClick={() => document.getElementById("atencao-agora")?.scrollIntoView({ behavior: "smooth" })}><span className="danger"><AlertTriangle/></span><div><small>Atenção agora</small><b>{loaded ? attentionCount : "—"}</b><em>{attentionCount ? "itens prioritários" : "Tudo em ordem"}</em></div></button>
      <button onClick={() => go("/agenda")}><span className="purple"><CalendarDays/></span><div><small>Agenda de hoje</small><b>{loaded ? events.length : "—"}</b><em>{events.length === 1 ? "compromisso" : "compromissos"}</em></div></button>
      <button onClick={() => go("/atendimento/aplicativo")}><span className="blue"><MessageCircle/></span><div><small>Aguardando resposta</small><b>{loaded ? unread : "—"}</b><em>mensagens do app</em></div></button>
      <button onClick={() => go("/financeiro")}><span className="gold"><Wallet/></span><div><small>A receber</small><b className="money">{loaded ? brl(pendingAmount) : "—"}</b><em>{pending.length} pendentes</em></div></button>
    </section>

    <div className="hc-main-grid">
      <section className="hc-panel hc-attention" id="atencao-agora"><div className="hc-panel-title"><div><span><AlertTriangle size={17}/></span><div><h2>Atenção agora</h2><p>O que não pode esperar</p></div></div><b>{attentionCount}</b></div>
        {!loaded ? <div className="hc-skeleton"/> : priorityRows.length ? <ul>{priorityRows.map((item, index) => <li key={`${item.title}-${index}`}><button onClick={() => go(item.path)}><span className={item.tone}><item.icon size={18}/></span><div><b>{item.title}</b><small>{item.meta}</small></div><ChevronRight size={18}/></button></li>)}</ul> : <div className="hc-calm"><CheckSquare/><b>Nenhuma urgência agora</b><span>Seu painel está em dia.</span></div>}
      </section>
      <section className="hc-panel hc-agenda"><div className="hc-panel-title"><div><span><CalendarDays size={17}/></span><div><h2>Agenda de hoje</h2><p>Compromissos confirmados</p></div></div><button onClick={() => go("/agenda")}>Ver agenda <ChevronRight size={15}/></button></div>
        {!loaded ? <div className="hc-skeleton"/> : events.length ? <ul>{events.slice(0, 5).map((event) => <li key={event.id}><time>{hour(event.starts_at)}</time><div><b>{event.title}</b><small>{event.location || event.description || "Compromisso"}</small></div></li>)}</ul> : <div className="hc-calm"><CalendarDays/><b>Agenda livre hoje</b><span>Nenhum compromisso confirmado.</span></div>}
      </section>
    </div>

    <div className="hc-bottom-grid">
      <section className="hc-panel hc-tasks"><div className="hc-panel-title"><div><span><CheckSquare size={17}/></span><div><h2>Tarefas prioritárias</h2><p>Próximas ações do escritório</p></div></div><button onClick={() => go("/afazeres")}>Ver todas <ChevronRight size={15}/></button></div>
        {tasks.length ? <ul>{tasks.slice(0, 4).map((task) => <li key={task.id}><span className="task-dot"/><div><b>{task.title}</b><small>{task.due_date ? `Até ${shortDate(task.due_date)}` : task.notes || "Sem prazo definido"}</small></div></li>)}</ul> : <div className="hc-calm compact"><CheckSquare/><b>Nenhuma tarefa pendente</b></div>}
      </section>
      <section className="hc-panel"><div className="hc-panel-title"><div><span><Wallet size={17}/></span><div><h2>Resumo financeiro</h2><p>Recebimentos em aberto</p></div></div><button onClick={() => go("/financeiro")}>Detalhes <ChevronRight size={15}/></button></div><div className="hc-finance-grid"><div><small>Total pendente</small><b>{brl(pendingAmount)}</b></div><div><small>Lançamentos</small><b>{pending.length}</b></div></div></section>
    </div>
    <button className="hc-mobile-add" type="button" onClick={() => go("/atendimento")} aria-label="Novo atendimento"><Plus/></button>
  </div>;
}
