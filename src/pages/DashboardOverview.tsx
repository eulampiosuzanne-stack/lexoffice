// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, CheckSquare, ChevronRight, CircleDollarSign, FilePlus2, FileText, FolderOpen, Megaphone, MessageCircle, Plus, Scale, Search, Wallet } from "lucide-react";
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
  const [loadError, setLoadError] = useState(false);
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
    if (!supabase) { setLoadError(true); setLoaded(true); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadError(true); setLoaded(true); return; }
    const { data: p } = await supabase.from("profiles").select("org_id,name").eq("id", user.id).maybeSingle();
    setProfile(p || {});
    if (!p?.org_id) { setLoadError(true); setLoaded(true); return; }
    const { start, end } = saopauloDay();
    const [f, e, t, d, i] = await Promise.all([
      supabase.from("financial_entries").select("id,amount,status,paid_at,due_date,description").eq("org_id", p.org_id).eq("type", "income").limit(1000),
      supabase.from("calendar_events").select("id,title,description,starts_at,location,event_type,status").eq("org_id", p.org_id).gte("starts_at", start).lte("starts_at", end).neq("status", "cancelled").order("starts_at").limit(12),
      supabase.from("office_tasks").select("id,title,notes,priority,due_date,created_at").eq("org_id", p.org_id).eq("scope", "geral").is("done_at", null).order("due_date", { ascending: true, nullsFirst: false }).limit(8),
      supabase.from("process_deadlines").select("id,title,due_at,status,priority").eq("org_id", p.org_id).neq("status", "completed").order("due_at").limit(12),
      supabase.from("client_app_inbox").select("id", { count: "exact", head: true }).eq("org_id", p.org_id).is("read_at", null),
    ]);
    if ([f,e,t,d,i].some(result => result.error)) setLoadError(true);
    setFinance(f.data || []); setEvents(e.data || []); setTasks(t.data || []); setDeadlines(d.data || []); setUnread(i.count || 0); setLoaded(true);
  })().catch((error) => { console.error("Falha ao carregar painel", error); setLoadError(true); setLoaded(true); }); }, []);

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
    if (loadError) return { label: "Dados incompletos ou indisponíveis", detail: "Não foi possível confirmar todos os alertas. Consulte diretamente a agenda e os processos.", path: "/agenda", level: "critical" };
    if (!loaded) return { label: "Conferindo os dados do escritório", detail: "Os alertas serão exibidos após o carregamento.", path: "/agenda", level: "loading" };
    const urgent = [...deadlines].filter(x => x.due_at && x.status !== "completed").sort((a,b)=>new Date(a.due_at).getTime()-new Date(b.due_at).getTime())[0];
    if (urgent?.due_at) {
      const dueDay = new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(urgent.due_at));
      const todayDay = new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      const tomorrowDay = new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()+86400000));
      if(dueDay <= todayDay) return {label:dueDay < todayDay?"Prazo vencido ou pendente de baixa":"Prazo com vencimento hoje",detail:urgent.title || "Confira o processo e o prazo.",path:"/processos",level:"critical"};
      if(dueDay===tomorrowDay) return {label:"Prazo previsto para amanhã",detail:urgent.title || "Confira o processo e o prazo.",path:"/processos",level:"warning"};
    }
    const hearing=appointments.find(x=>/audi[eê]ncia/i.test(`${x.event_type||""} ${x.title||""}`));
    if(hearing) return {label:"Audiência na agenda de hoje",detail:`${hour(hearing.starts_at)} · ${hearing.title||"Verificar compromisso"}`,path:"/agenda",level:"warning"};
    if(unread) return {label:"Cliente aguardando resposta",detail:`${unread} mensagem(ns) não lida(s) no aplicativo.`,path:"/atendimento/aplicativo",level:"info"};
    if(pending.length) return {label:"Pendência financeira para conferir",detail:`${pending.length} recebimento(s) aguardando conferência.`,path:"/financeiro",level:"finance"};
    return {label:"Guardiã SF de olho na agenda",detail:"Nenhum dos alertas prioritários acima foi identificado neste resumo. Confira os autos e a agenda completa.",path:"/agenda",level:"calm"};
  },[loaded,loadError,deadlines,appointments,unread,pending]);
  const firstName = String(profile.name || "").trim().split(/\\s+/)[0];
  const spHour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greeting = spHour < 12 ? "Bom dia" : spHour < 18 ? "Boa tarde" : "Boa noite";
  const today = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const priorityRows = [
    ...critical.slice(0, 2).map((x) => ({ id: x.id, icon: Scale, title: x.title || "Prazo processual", meta: `Vence ${shortDate(x.due_at)}`, path: "/processos", tone: "danger" })),
    ...(unread ? [{ icon: MessageCircle, title: `${unread} ${unread === 1 ? "mensagem aguarda" : "mensagens aguardam"} resposta`, meta: "Aplicativo do cliente", path: "/atendimento/aplicativo", tone: "info" }] : []),
    ...(pending.length ? [{ icon: Wallet, title: `${pending.length} ${pending.length === 1 ? "recebimento pendente" : "recebimentos pendentes"}`, meta: brl(pendingAmount), path: "/financeiro", tone: "gold" }] : []),
  ].slice(0, 4);

  return <div className="home-command">
    <section className="sf-hero-banner" aria-label="Banner Superadvogadas SF">
      <img src="/brand/superadvogadas-banner.png" alt="As três Superadvogadas SF voam ao lado da Guardiã SF sobre a cidade e o escritório. Mais que direito, soluções para a sua vida. Organização, Produtividade, Estratégia e Crescimento." decoding="async" fetchPriority="high"/>
      <div className="sf-hero-caption">
        <strong>Mais que direito, soluções para a sua vida.</strong>
        <span>Organização · Produtividade · Estratégia · Crescimento</span>
      </div>
    </section>
    <section className="hc-primary-actions" aria-label="Ações principais do escritório">
      <div className="hc-primary-actions-grid">
        {[
          {name:"Nova Ação",desc:"Petição com IA",path:"/documentos/gerar",icon:FilePlus2,variant:"wine"},
          {name:"Análise de Caso",desc:"Estratégia e risco",path:"/jurimetria",icon:Search,variant:"gold"},
          {name:"Honorários",desc:"Tabela OAB",path:"/perfil-cliente/honorarios",icon:CircleDollarSign,variant:"wine"},
          {name:"Agenda",desc:"Audiências e prazos",path:"/agenda",icon:CalendarDays,variant:"gold"},
          {name:"Documentos",desc:"Dossiês e anexos",path:"/documentos",icon:FolderOpen,variant:"wine"},
          {name:"Marketing",desc:"Conteúdo e redes",path:"/marketing",icon:Megaphone,variant:"gold"},
          {name:"Relatórios",desc:"Gestão do escritório",path:"/relatorios",icon:BarChart3,variant:"wine"},
        ].map(item=>{const Icon=item.icon;return <button type="button" className={`sf-3d-action sf-3d-${item.variant}`} key={item.name} onClick={()=>go(item.path)}><Icon size={30} strokeWidth={1.8} aria-hidden="true"/><strong>{item.name}</strong><small>{item.desc}</small></button>})}
      </div>
    </section>
    <header className="hc-greeting">
      <div><small>{today.charAt(0).toUpperCase() + today.slice(1)}</small><h1>{greeting}{firstName ? `, ${/^suzanne$/i.test(firstName) ? "Dra. Suzanne" : firstName}` : ""}</h1><p>Aqui está o que precisa da sua atenção hoje.</p></div>
      <button className="hc-primary" type="button" onClick={() => go("/whatsapp")}><MessageCircle size={18}/> Abrir conversas</button>
    </header>

    <section className={`hc-guardian-status hc-guardian-${guardianAlert.level}`} aria-label="Aviso da Guardiã SF" data-guardian-state={guardianAlert.level} data-critical-alert={guardianAlert.level==="critical"?"true":undefined}>
      <span className="hc-guardian-face" aria-hidden="true"><img className="hc-guardian-img" src="/brand/guardia-sf.webp" alt="" width={64} height={64} decoding="async"/></span>
      <div><strong>Guardiã SF · {guardianAlert.label}</strong><p>{guardianAlert.detail}</p></div>
      <button type="button" onClick={()=>go(guardianAlert.path)}>Conferir <ChevronRight size={18}/></button>
    </section>
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
    <section className="hc-metrics" aria-label="Resumo do dia">
      <button onClick={() => document.getElementById("atencao-agora")?.scrollIntoView({ behavior: "smooth" })}><span className="danger"><AlertTriangle/></span><div><small>Atenção agora</small><b>{loaded ? attentionCount : "—"}</b><em>{loadError ? "Dados indisponíveis" : !loaded ? "Carregando" : attentionCount ? "itens prioritários" : "Sem alertas identificados"}</em></div></button>
      <button onClick={() => go("/agenda")}><span className="purple"><CalendarDays/></span><div><small>Agenda de hoje</small><b>{loaded ? appointments.length : "—"}</b><em>{appointments.length === 1 ? "compromisso" : "compromissos"}</em></div></button>
      <button onClick={() => go("/atendimento/aplicativo")}><span className="blue"><MessageCircle/></span><div><small>Aguardando resposta</small><b>{loaded ? unread : "—"}</b><em>mensagens do app</em></div></button>
      <button onClick={() => go("/financeiro")}><span className="gold"><Wallet/></span><div><small>A receber</small><b className="money">{loaded ? brl(pendingAmount) : "—"}</b><em>{pending.length} pendentes</em></div></button>
    </section>

    <div className="hc-main-grid">
      <section className="hc-panel hc-attention" id="atencao-agora"><div className="hc-panel-title"><div><span><AlertTriangle size={17}/></span><div><h2>Atenção agora</h2><p>O que não pode esperar</p></div></div><b>{attentionCount}</b></div>
        {deadlineError && <p role="alert" className="hc-deadline-error">{deadlineError}</p>}
        {!loaded ? <div className="hc-skeleton"/> : priorityRows.length ? <ul>{priorityRows.map((item, index) => <li key={`${item.title}-${index}`}><button onClick={() => go(item.path)}><span className={item.tone}><item.icon size={18}/></span><div><b>{item.title}</b><small>{item.meta}</small></div><ChevronRight size={18}/></button>{item.id && <button type="button" className="hc-deadline-complete" disabled={closingDeadline === item.id} onClick={() => closeDeadline(item.id, item.title)}><CheckSquare size={15}/> {closingDeadline === item.id ? "Registrando..." : "Dar baixa no prazo"}</button>}</li>)}</ul> : <div className="hc-calm"><CheckSquare/><b>{loadError ? "Não foi possível confirmar os alertas" : "Nenhuma urgência identificada"}</b><span>{loadError ? "Verifique a agenda e os processos diretamente." : "Confira os autos e as demais fontes antes de concluir que não há pendências."}</span></div>}
      </section>
      <section className="hc-panel hc-agenda"><div className="hc-panel-title"><div><span><CalendarDays size={17}/></span><div><h2>Agenda de hoje</h2><p>Reuniões e audiências, separadas dos prazos estimados</p></div></div><button onClick={() => go("/agenda")}>Ver agenda <ChevronRight size={15}/></button></div>
        {!loaded ? <div className="hc-skeleton"/> : appointments.length ? <ul>{appointments.slice(0, 5).map((event) => <li key={event.id}><button type="button" className="hc-agenda-event" onClick={()=>go("/agenda")}><time>{hour(event.starts_at)}</time><div><b>{event.title}</b><small>{event.location || event.description || "Compromisso"}</small><ChevronRight size={18}/></div></button></li>)}</ul> : <div className="hc-calm"><CalendarDays/><b>Agenda livre hoje</b><span>Nenhuma reunião ou audiência encontrada.</span></div>}
        {loaded && calendarDeadlines.length > 0 && <div className="hc-deadline-summary"><Scale size={17}/><span><b>{calendarDeadlines.length} prazo(s) na agenda</b><small>Estimativas não são compromissos confirmados. Confira os autos.</small></span><button type="button" onClick={() => go("/agenda")}>Consultar</button></div>}
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
