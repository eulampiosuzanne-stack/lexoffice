import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ListChecks, Plus, Trash2, Loader2, CalendarDays, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './afazeres.css';

type Resp = 'suzanne' | 'glaucia' | 'ambas';
type Task = { law_area:string|null; activity_type:string|null; external_person_name:string|null; client_id:string|null; task_status:string; id: string; title: string; notes: string | null; due_date: string | null; responsible: Resp; priority: 'baixa' | 'normal' | 'alta' | 'urgente'; done_at: string | null; created_at: string };
const AREAS=['Família','Sucessões','Cível','Consumidor','Bancário','Trabalhista','Criminal','Imobiliário','Saúde','Previdenciário','Tributário','Empresarial','Administrativo','Outros'];
const ATIVIDADES=['Solicitar documento','Buscar ou retirar documento','Receber e conferir documento','Enviar documento para assinatura','Cobrar assinatura','Digitalizar documento','Elaborar petição inicial','Ajuizar ação','Protocolar manifestação','Contestação ou réplica','Interpor recurso','Cumprir despacho','Verificar andamento','Cumprir decisão','Agendar reunião','Realizar reunião','Retornar contato','Preparar consulta','Atualizar cliente','Contatar cartório ou gabinete','Elaborar contrato','Enviar contrato para assinatura','Preparar proposta','Conferir pagamento','Solicitar certidão','Providenciar procuração','Cumprir prazo processual','Outra atividade'];
const RESP: Record<Resp, string> = { suzanne: 'Suzanne', glaucia: 'Gláucia', ambas: 'Nós duas' };
type Filtro = 'pendentes' | 'feitas' | 'todas';

const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dataBR = (iso: string) => iso.split('-').reverse().join('/');

export default function Afazeres({ embedded = false }: { embedded?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients,setClients]=useState<{id:string;name:string}[]>([]);
  const [vinculo,setVinculo]=useState('cliente');
  const [areaFiltro,setAreaFiltro]=useState('todas');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [quem, setQuem] = useState<'todas' | Resp>('todas');
  const [novo, setNovo] = useState({ title: '', due_date: '', responsible: 'ambas' as Resp, priority: 'normal' as 'baixa' | 'normal' | 'alta' | 'urgente', notes: '',law_area:'Família',activity_type:'Solicitar documento',client_id:'',external_person_name:'',task_status:'pendente' });
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    if (!supabase) { setLoading(false); setErro('Sistema sem conexão com o banco.'); return; }
    const {data:clientData}=await supabase.from('clients').select('id,name').order('name').limit(1000);if(clientData)setClients(clientData);
    const { data, error } = await supabase.from('office_tasks').select('id,title,notes,due_date,responsible,priority,done_at,created_at,law_area,activity_type,external_person_name,client_id,task_status').eq('scope', 'geral').order('created_at', { ascending: false }).limit(500);
    setLoading(false);
    if (error) { setErro('Não foi possível carregar os afazeres.'); return; }
    setErro(''); setTasks((data || []) as Task[]);
  }
  useEffect(() => {
    carregar();
    if (!supabase) return;
    const ch = supabase.channel('lexoffice-afazeres').on('postgres_changes', { event: '*', schema: 'public', table: 'office_tasks' }, () => carregar()).subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, []);

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    const title = novo.title.trim();
    if (!title) { setErro('Escreva o que precisa ser feito.'); return; }
    if (title.length > 300) { setErro('O texto do afazer pode ter no máximo 300 caracteres.'); return; }
    if (!supabase) return;
    setSalvando(true);
    const { error } = await supabase.from('office_tasks').insert({ scope: 'geral', title, notes: novo.notes.trim() || null, due_date: novo.due_date || null, responsible: novo.responsible, priority: novo.priority,law_area:novo.law_area,activity_type:novo.activity_type,client_id:vinculo==='cliente'?novo.client_id||null:null,external_person_name:vinculo==='externo'?novo.external_person_name.trim()||null:null,task_status:'pendente' });
    setSalvando(false);
    if (error) { setErro('Não foi possível salvar o afazer.'); return; }
    setErro(''); setNovo({ title: '', due_date: '', responsible: novo.responsible, priority: 'normal', notes: '',law_area:novo.law_area,activity_type:novo.activity_type,client_id:'',external_person_name:'',task_status:'pendente' }); carregar();
  }
  async function marcar(t: Task) {
    if (!supabase) return;
    const done_at = t.done_at ? null : new Date().toISOString();
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done_at } : x)));
    const { error } = await supabase.from('office_tasks').update({ done_at }).eq('id', t.id);
    if (error) { setErro('Não foi possível atualizar. Tente de novo.'); carregar(); }
  }
  async function excluir(t: Task) {
    if (!supabase || !window.confirm(`Excluir o afazer "${t.title}"?`)) return;
    const { error } = await supabase.from('office_tasks').delete().eq('id', t.id);
    if (error) { setErro('Não foi possível excluir.'); return; }
    setTasks((ts) => ts.filter((x) => x.id !== t.id));
  }

  const lista = useMemo(() => {
    const h = hoje();
    return tasks
      .filter((t) => (filtro === 'todas' ? true : filtro === 'feitas' ? !!t.done_at : !t.done_at))
      .filter((t)=>areaFiltro==='todas'||t.law_area===areaFiltro)
      .filter((t) => quem === 'todas' || t.responsible === quem || t.responsible === 'ambas')
      .sort((a, b) => {
        if (!!a.done_at !== !!b.done_at) return a.done_at ? 1 : -1;
        if (a.done_at && b.done_at) return b.done_at.localeCompare(a.done_at);
        if(a.priority!==b.priority){const rank:Record<string,number>={urgente:0,alta:1,normal:2,baixa:3};return (rank[a.priority]??2)-(rank[b.priority]??2)}
        const da = a.due_date || '9999', db = b.due_date || '9999';
        return da.localeCompare(db) || b.created_at.localeCompare(a.created_at);
      })
      .map((t) => ({ ...t, atrasada: !t.done_at && !!t.due_date && t.due_date < h, hoje: !t.done_at && t.due_date === h }))
      .slice(0, embedded ? 6 : undefined);
  }, [tasks, filtro, quem, embedded, areaFiltro]);
  const pendentes = tasks.filter((t) => !t.done_at).length;

  return <div className={`afz-page${embedded ? ' afz-embedded' : ''}`}>
    {!embedded && <div className="page-title"><h1>Afazeres</h1><p>O que você e a Gláucia precisam fazer. Marque quando estiver feito.</p></div>}
    {embedded ? <form className="afz-quick" onSubmit={adicionar}>
      <input placeholder="Anotar um afazer e apertar Enter" value={novo.title} maxLength={300} onChange={(e) => setNovo({ ...novo, title: e.target.value })} aria-label="Novo afazer" />
      <button className="afz-btn" type="submit" disabled={salvando}>{salvando ? <Loader2 size={15} className="afz-spin" /> : <Plus size={15} />}Adicionar</button>
    </form> : <form className="afz-panel afz-form" onSubmit={adicionar}>
      <input className="afz-title" placeholder="O que precisa ser feito?" value={novo.title} maxLength={300} onChange={(e) => setNovo({ ...novo, title: e.target.value })} aria-label="Afazer" />
      <div className="afz-row">
        <label>Área do Direito<select value={novo.law_area} onChange={e=>setNovo({...novo,law_area:e.target.value})}>{AREAS.map(a=><option key={a}>{a}</option>)}</select></label>
        <label>Atividade<select value={novo.activity_type} onChange={e=>setNovo({...novo,activity_type:e.target.value,title:e.target.value==='Outra atividade'?novo.title:e.target.value})}>{ATIVIDADES.map(a=><option key={a}>{a}</option>)}</select></label>
        <label>Vínculo<select value={vinculo} onChange={e=>setVinculo(e.target.value)}><option value="cliente">Cliente cadastrado</option><option value="externo">Pessoa ou instituição externa</option><option value="interno">Atividade interna</option></select></label>
        {vinculo==='cliente'&&<label>Cliente<select value={novo.client_id} onChange={e=>setNovo({...novo,client_id:e.target.value})}><option value="">Selecione um cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {vinculo==='externo'&&<label>Nome da pessoa/instituição<input value={novo.external_person_name} onChange={e=>setNovo({...novo,external_person_name:e.target.value})} placeholder="Nome completo"/></label>}
        <label>Quem<select value={novo.responsible} onChange={(e) => setNovo({ ...novo, responsible: e.target.value as Resp })}>{(Object.keys(RESP) as Resp[]).map((k) => <option key={k} value={k}>{RESP[k]}</option>)}</select></label>
        <label>Prazo<input type="date" value={novo.due_date} onChange={(e) => setNovo({ ...novo, due_date: e.target.value })} /></label>
        <label>Prioridade<select value={novo.priority} onChange={(e) => setNovo({ ...novo, priority: e.target.value as 'normal' | 'urgente' })}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label>
        <button className="afz-btn" type="submit" disabled={salvando}>{salvando ? <Loader2 size={15} className="afz-spin" /> : <Plus size={15} />}Adicionar</button>
      </div>
      <input className="afz-notes" placeholder="Observação (opcional)" value={novo.notes} maxLength={2000} onChange={(e) => setNovo({ ...novo, notes: e.target.value })} aria-label="Observação" />
    </form>}
    {erro && <p className="afz-erro">{erro}</p>}
    {!embedded && <div className="afz-filters">
      <div className="afz-seg" role="tablist" aria-label="Situação">{(['pendentes', 'feitas', 'todas'] as Filtro[]).map((f) => <button key={f} type="button" role="tab" aria-selected={filtro === f} className={filtro === f ? 'active' : ''} onClick={() => setFiltro(f)}>{f === 'pendentes' ? `Pendentes (${pendentes})` : f === 'feitas' ? 'Feitas' : 'Todas'}</button>)}</div>
      <label>Área <select value={areaFiltro} onChange={e=>setAreaFiltro(e.target.value)}><option value="todas">Todas as áreas</option>{AREAS.map(a=><option key={a}>{a}</option>)}</select></label>
      <div className="afz-seg" role="tablist" aria-label="Responsável">{(['todas', 'suzanne', 'glaucia'] as const).map((q) => <button key={q} type="button" role="tab" aria-selected={quem === q} className={quem === q ? 'active' : ''} onClick={() => setQuem(q)}>{q === 'todas' ? 'De todas' : RESP[q]}</button>)}</div>
    </div>}
    <section className={embedded ? 'afz-plain' : 'afz-panel'}>
      {loading ? <p className="afz-empty"><Loader2 size={16} className="afz-spin" /> Carregando...</p>
        : lista.length === 0 ? <p className="afz-empty"><ListChecks size={18} /> {filtro === 'feitas' ? 'Nada marcado como feito ainda.' : (embedded ? 'Tudo em dia. Nenhum afazer pendente.' : 'Nenhum afazer pendente.')}</p>
        : <ul className="afz-list">{lista.map((t) => <li key={t.id} className={`${t.done_at ? 'done' : ''} ${t.atrasada ? 'late' : ''}`}>
          <label className="afz-check"><input type="checkbox" checked={!!t.done_at} onChange={() => marcar(t)} aria-label={`Marcar "${t.title}" como ${t.done_at ? 'não feito' : 'feito'}`} /><span /></label>
          <div className="afz-body">
            <b>{t.title}</b>
            {t.notes && <small className="afz-obs">{t.notes}</small>}
            <div className="afz-meta">
              <span className="afz-tag">{RESP[t.responsible]}</span>{t.law_area&&<span className="afz-tag">{t.law_area}</span>}{t.activity_type&&<span className="afz-tag">{t.activity_type}</span>}{t.external_person_name&&<span className="afz-tag">{t.external_person_name}</span>}{t.client_id&&<span className="afz-tag">{clients.find(c=>c.id===t.client_id)?.name||"Cliente"}</span>}{t.priority==="alta"&&!t.done_at&&<span className="afz-tag">Alta prioridade</span>}
              {t.priority === 'urgente' && !t.done_at && <span className="afz-tag urgent"><AlertTriangle size={12} />Urgente</span>}
              {t.due_date && <span className={`afz-tag ${t.atrasada ? 'late' : t.hoje ? 'today' : ''}`}><CalendarDays size={12} />{t.atrasada ? 'Atrasado · ' : t.hoje ? 'Hoje · ' : ''}{dataBR(t.due_date)}</span>}
              {t.done_at && <span className="afz-tag">Feito em {new Date(t.done_at).toLocaleDateString('pt-BR')}</span>}
            </div>
          </div>
          <button className="afz-del" type="button" onClick={() => excluir(t)} title="Excluir" aria-label={`Excluir "${t.title}"`}><Trash2 size={15} /></button>
        </li>)}</ul>}
    </section>
  </div>;
}
