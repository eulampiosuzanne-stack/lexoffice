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
  const [closingDeadline, setClosingDeadline] = useState<string | null>(null);
  const [deadlineError, setDeadlineError] = useState("");
  const closeDeadline = async (id: string, title: string) => {
    if (!profile.org_id || !window.confirm(`Dar baixa no prazo: ${title}? Confirme somente se a providência foi efetivamente realizada.`)) return;
    setClosingDeadline(id); setDeadlineError("");
    const { data, error } = await supabase.from("process_deadlines").update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", profile.org_id).neq("status", "completed").select("id");
    if (error || !data?.length) setDeadlineError(error?.message || "Não foi possível confirmar a baixa. Verifique as permissões.");
    else setDeadlines((previous) => previous.filter((deadline) => deadline.id !== id));
    setClosingDeadline(null);
  };

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

  const appointments = useMemo(() => events.filter((x) => !/prazo|intimação|intimacao|deadline/i.test(`${x.event_type || ""} ${x.title || ""}`)), [events]);
  const calendarDeadlines = useMemo(() => events.filter((x) => /prazo|intimação|intimacao|deadline/i.test(`${x.event_type || ""} ${x.title || ""}`)), [events]);
  const pending = useMemo(() => finance.filter((x) => x.status !== "paid" && !x.paid_at), [finance]);
  const pendingAmount = useMemo(() => pending.reduce((sum, x) => sum + (Number(x.amount) || 0), 0), [pending]);
  const critical = useMemo(() => deadlines.filter((x) => {
    const due = dt(x.due_at); if (!due) return false;
    return due.getTime() <= Date.now() + 48 * 60 * 60 * 1000 || String(x.priority || "").toLowerCase() === "high";
  }), [deadlines]);
  const attentionCount = critical.length + (unread ? 1 : 0) + (pending.length ? 1 : 0);
  const guardianAlert = useMemo(() => {
    if (!loaded) return { label: "Conferindo os dados do escritório", detail: "Os alertas serão exibidos após o carregamento.", path: "/agenda", level: "loading" };
    const urgent = [...deadlines].filter(x => x.due_at && x.status !== "completed").sort((a,b)=>new Date(a.due_at).getTime()-new Date(b.due_at).getTime())[0];
    if (urgent?.due_at) {
      const dueDay = new Date(urgent.due_at).toLocaleDateString("en-CA", {timeZone:"America/Sao_Paulo"});
      const todayDay = new Date().toLocaleDateString("en-CA", {timeZone:"America/Sao_Paulo"});
      const tomorrowDay = new Date(Date.now()+86400000).toLocaleDateString("en-CA", {timeZone:"America/Sao_Paulo"});
      if(dueDay <= todayDay) return {label:dueDay < todayDay?"Prazo vencido ou pendente de baixa":"Prazo com vencimento hoje",detail:urgent.title || "Confira o processo e o prazo.",path:"/processos",level:"critical"};
      if(dueDay===tomorrowDay) return {label:"Prazo previsto para amanhã",detail:urgent.title || "Confira o processo e o prazo.",path:"/processos",level:"warning"};
    }
    const hearing=appointments.find(x=>/audi[eê]ncia/i.test(`${x.event_type||""} ${x.title||""}`));
    if(hearing) return {label:"Audiência na agenda de hoje",detail:`${hour(hearing.starts_at)} · ${hearing.title||"Verificar compromisso"}`,path:"/agenda",level:"warning"};
    if(unread) return {label:"Cliente aguardando resposta",detail:`${unread} mensagem(ns) não lida(s) no aplicativo.`,path:"/atendimento/aplicativo",level:"info"};
    return {label:"Guardiã SF de olho na agenda",detail:"Nenhum dos alertas prioritários acima foi identificado neste resumo. Confira os autos e a agenda completa.",path:"/agenda",level:"calm"};
  },[loaded,deadlines,appointments,unread]);
  const firstName = String(profile.name || "").trim().split(/\\s+/)[0];
  const greeting = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const priorityRows = [
    ...critical.slice(0, 2).map((x) => ({ id: x.id, icon: Scale, title: x.title || "Prazo processual", meta: `Vence ${shortDate(x.due_at)}`, path: "/processos", tone: "danger" })),
    ...(unread ? [{ icon: MessageCircle, title: `${unread} ${unread === 1 ? "mensagem aguarda" : "mensagens aguardam"} resposta`, meta: "Aplicativo do cliente", path: "/atendimento/aplicativo", tone: "info" }] : []),
    ...(pending.length ? [{ icon: Wallet, title: `${pending.length} ${pending.length === 1 ? "recebimento pendente" : "recebimentos pendentes"}`, meta: brl(pendingAmount), path: "/financeiro", tone: "gold" }] : []),
  ].slice(0, 4);

  return <div className="home-command">
    <header className="hc-greeting">
      <div><small>{today.charAt(0).toUpperCase() + today.slice(1)}</small><h1>{greeting}{firstName ? `, ${/^suzanne$/i.test(firstName) ? "Dra. Suzanne" : firstName}` : ""}</h1><p>Aqui está o que precisa da sua atenção hoje.</p></div>
      <button className="hc-primary" type="button" onClick={() => go("/whatsapp")}><MessageCircle size={18}/> Abrir conversas</button>
    </header>

    <section className={`hc-guardian-status hc-guardian-${guardianAlert.level}`} aria-label="Aviso da Guardiã SF">
      <span className="hc-guardian-face" aria-hidden="true">🐶</span>
      <div><strong>Guardiã SF · {guardianAlert.label}</strong><p>{guardianAlert.detail}</p></div>
      <button type="button" onClick={()=>go(guardianAlert.path)}>Conferir <ChevronRight size={18}/></button>
    </section>
    <section className="hc-metrics" aria-label="Resumo do dia">
      <button onClick={() => document.getElementById("atencao-agora")?.scrollIntoView({ behavior: "smooth" })}><span className="danger"><AlertTriangle/></span><div><small>Atenção agora</small><b>{loaded ? attentionCount : "—"}</b><em>{attentionCount ? "itens prioritários" : "Tudo em ordem"}</em></div></button>
      <button onClick={() => go("/agenda")}><span className="purple"><CalendarDays/></span><div><small>Agenda de hoje</small><b>{loaded ? appointments.length : "—"}</b><em>{appointments.length === 1 ? "compromisso" : "compromissos"}</em></div></button>
      <button onClick={() => go("/atendimento/aplicativo")}><span className="blue"><MessageCircle/></span><div><small>Aguardando resposta</small><b>{loaded ? unread : "—"}</b><em>mensagens do app</em></div></button>
      <button onClick={() => go("/financeiro")}><span className="gold"><Wallet/></span><div><small>A receber</small><b className="money">{loaded ? brl(pendingAmount) : "—"}</b><em>{pending.length} pendentes</em></div></button>
    </section>

    <div className="hc-main-grid">
      <section className="hc-panel hc-attention" id="atencao-agora"><div className="hc-panel-title"><div><span><AlertTriangle size={17}/></span><div><h2>Atenção agora</h2><p>O que não pode esperar</p></div></div><b>{attentionCount}</b></div>
        {deadlineError && <p role="alert" style={{ color: "#ffb4b4", padding: "8px 16px" }}>{deadlineError}</p>}
        {!loaded ? <div className="hc-skeleton"/> : priorityRows.length ? <ul>{priorityRows.map((item, index) => <li key={`${item.title}-${index}`}><button onClick={() => go(item.path)}><span className={item.tone}><item.icon size={18}/></span><div><b>{item.title}</b><small>{item.meta}</small></div><ChevronRight size={18}/></button>{item.id && <button type="button" disabled={closingDeadline === item.id} onClick={() => closeDeadline(item.id, item.title)} style={{ margin: "6px 12px 10px", padding: "8px 12px", border: "1px solid #bba16a", borderRadius: 6, color: "#f1dfb5", background: "#252932", fontSize: 13, cursor: "pointer" }}><CheckSquare size={15}/> {closingDeadline === item.id ? "Registrando..." : "Dar baixa no prazo"}</button>}</li>)}</ul> : <div className="hc-calm"><CheckSquare/><b>Nenhuma urgência agora</b><span>Seu painel está em dia.</span></div>}
      </section>
      <section className="hc-panel hc-agenda"><div className="hc-panel-title"><div><span><CalendarDays size={17}/></span><div><h2>Agenda de hoje</h2><p>Reuniões e audiências, separadas dos prazos estimados</p></div></div><button onClick={() => go("/agenda")}>Ver agenda <ChevronRight size={15}/></button></div>
        {!loaded ? <div className="hc-skeleton"/> : appointments.length ? <ul>{appointments.slice(0, 5).map((event) => <li key={event.id}><time>{hour(event.starts_at)}</time><div><b>{event.title}</b><small>{event.location || event.description || "Compromisso"}</small></div></li>)}</ul> : <div className="hc-calm"><CalendarDays/><b>Agenda livre hoje</b><span>Nenhuma reunião ou audiência encontrada.</span></div>}
        {loaded && calendarDeadlines.length > 0 && <div className="hc-deadline-summary"><Scale size={17}/><span><b>{calendarDeadlines.length} prazo(s) na agenda</b><small>Estimativas não são compromissos confirmados. Confira os autos.</small></span><button type="button" onClick={() => go("/agenda")}>Consultar</button></div>}
      </section>
    </div>

    <div className="hc-bottom-grid">
      <section className="hc-panel hc-tasks"><div className="hc-panel-title"><div><span><CheckSquare size={17}/></span><div><h2>Tarefas prioritárias</h2><p>Próximas ações do escritório</p></div></div><button onClick={() => go("/afazeres")}>Ver todas <ChevronRight size={15}/></button></div>
        {tasks.length ? <ul>{tasks.slice(0, 4).map((task) => <li key={task.id}><span className="task-dot"/><div><b>{task.title}</b><small>{task.due_date ? `Até ${shortDate(task.due_date)}` : task.notes || "Sem prazo definido"}</small></div></li>)}</ul> : <div className="hc-calm compact"><CheckSquare/><b>Nenhuma tarefa pendente</b></div>}
      </section>
      <section className="hc-panel"><div className="hc-panel-title"><div><span><Wallet size={17}/></span><div><h2>Resumo financeiro</h2><p>Recebimentos em aberto</p></div></div><button onClick={() => go("/financeiro")}>Detalhes <ChevronRight size={15}/></button></div><div className="hc-finance-grid"><div><small>Total pendente</small><b>{brl(pendingAmount)}</b></div><div><small>Lançamentos</small><b>{pending.length}</b></div></div></section>
    </div>
    <section className="hc-strategy" aria-label="Central estratégica Superadvogadas SF">
      <div className="hc-strategy-heading"><div><h2>Central estratégica SF</h2><p>Acesso rápido às ferramentas existentes do escritório. Os módulos continuam sujeitos às permissões e à disponibilidade real de cada serviço.</p></div></div>
      <div className="hc-strategy-grid">
        {[
          {name:"Painel da Sócia",desc:"Resultados e gestão",path:"/painel",symbol:"👑"},
          {name:"Análise de Casos",desc:"Documentos e argumentos",path:"/jurimetria",symbol:"📚"},
          {name:"Donna e Helena",desc:"Atendimento e briefing",path:"/donna",symbol:"💬"},
          {name:"Análise do Juízo",desc:"Estratégia processual",path:"/conducao-processual",symbol:"⚖️"},
          {name:"Sherlock",desc:"Consultas e investigação",path:"/consultas",symbol:"🔎"},
          {name:"Planejamento",desc:"Cenários e providências",path:"/planejamento",symbol:"📈"},
          {name:"Escritório móvel",desc:"Documentos e assinaturas",path:"/assinaturas",symbol:"✍️"},
          {name:"Andamentos",desc:"Acompanhar processos",path:"/andamentos",symbol:"📄"},
          {name:"Campanhas",desc:"Marketing e captação",path:"/marketing",symbol:"📣"},
          {name:"Alertas e tarefas",desc:"Agenda e prioridades",path:"/afazeres",symbol:"🛡️"},
        ].map(item=><button type="button" key={item.name} onClick={()=>go(item.path)}><span aria-hidden="true">{item.symbol}</span><strong>{item.name}</strong><small>{item.desc}</small><ChevronRight size={17} aria-hidden="true"/></button>)}
      </div>
    </section>
    <button className="hc-mobile-add" type="button" onClick={() => go("/atendimento")} aria-label="Novo atendimento"><Plus/></button>
  </div>;
}
