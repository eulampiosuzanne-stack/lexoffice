import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ListChecks, Plus, Trash2, Loader2, CalendarDays, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './afazeres.css';

type Resp = 'suzanne' | 'glaucia' | 'ambas';
type Task = { id: string; title: string; notes: string | null; due_date: string | null; responsible: Resp; priority: 'normal' | 'urgente'; done_at: string | null; created_at: string };
const RESP: Record<Resp, string> = { suzanne: 'Suzanne', glaucia: 'Gláucia', ambas: 'Nós duas' };
type Filtro = 'pendentes' | 'feitas' | 'todas';

const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dataBR = (iso: string) => iso.split('-').reverse().join('/');

export default function Afazeres({ embedded = false }: { embedded?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [quem, setQuem] = useState<'todas' | Resp>('todas');
  const [novo, setNovo] = useState({ title: '', due_date: '', responsible: 'ambas' as Resp, priority: 'normal' as 'normal' | 'urgente', notes: '' });
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    if (!supabase) { setLoading(false); setErro('Sistema sem conexão com o banco.'); return; }
    const { data, error } = await supabase.from('office_tasks').select('id,title,notes,due_date,responsible,priority,done_at,created_at').eq('scope', 'geral').order('created_at', { ascending: false }).limit(500);
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
    const { error } = await supabase.from('office_tasks').insert({ scope: 'geral', title, notes: novo.notes.trim() || null, due_date: novo.due_date || null, responsible: novo.responsible, priority: novo.priority });
    setSalvando(false);
    if (error) { setErro('Não foi possível salvar o afazer.'); return; }
    setErro(''); setNovo({ title: '', due_date: '', responsible: novo.responsible, priority: 'normal', notes: '' }); carregar();
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
      .filter((t) => quem === 'todas' || t.responsible === quem || t.responsible === 'ambas')
      .sort((a, b) => {
        if (!!a.done_at !== !!b.done_at) return a.done_at ? 1 : -1;
        if (a.done_at && b.done_at) return b.done_at.localeCompare(a.done_at);
        if (a.priority !== b.priority) return a.priority === 'urgente' ? -1 : 1;
        const da = a.due_date || '9999', db = b.due_date || '9999';
        return da.localeCompare(db) || b.created_at.localeCompare(a.created_at);
      })
      .map((t) => ({ ...t, atrasada: !t.done_at && !!t.due_date && t.due_date < h, hoje: !t.done_at && t.due_date === h }));
  }, [tasks, filtro, quem]);
  const pendentes = tasks.filter((t) => !t.done_at).length;

  return <div className={`afz-page${embedded ? ' afz-embedded' : ''}`}>
    {embedded
      ? <div className="afz-head"><h2><ListChecks size={18} />Afazeres</h2><small>{pendentes ? `${pendentes} pendente(s)` : 'Tudo em dia'}</small></div>
      : <div className="page-title"><h1>Afazeres</h1><p>O que você e a Gláucia precisam fazer. Marque quando estiver feito.</p></div>}
    <form className="afz-panel afz-form" onSubmit={adicionar}>
      <input className="afz-title" placeholder="O que precisa ser feito?" value={novo.title} maxLength={300} onChange={(e) => setNovo({ ...novo, title: e.target.value })} aria-label="Afazer" />
      <div className="afz-row">
        <label>Quem<select value={novo.responsible} onChange={(e) => setNovo({ ...novo, responsible: e.target.value as Resp })}>{(Object.keys(RESP) as Resp[]).map((k) => <option key={k} value={k}>{RESP[k]}</option>)}</select></label>
        <label>Prazo<input type="date" value={novo.due_date} onChange={(e) => setNovo({ ...novo, due_date: e.target.value })} /></label>
        <label>Prioridade<select value={novo.priority} onChange={(e) => setNovo({ ...novo, priority: e.target.value as 'normal' | 'urgente' })}><option value="normal">Normal</option><option value="urgente">Urgente</option></select></label>
        <button className="afz-btn" type="submit" disabled={salvando}>{salvando ? <Loader2 size={15} className="afz-spin" /> : <Plus size={15} />}Adicionar</button>
      </div>
      <input className="afz-notes" placeholder="Observação (opcional)" value={novo.notes} maxLength={2000} onChange={(e) => setNovo({ ...novo, notes: e.target.value })} aria-label="Observação" />
    </form>
    {erro && <p className="afz-erro">{erro}</p>}
    <div className="afz-filters">
      <div className="afz-seg" role="tablist" aria-label="Situação">{(['pendentes', 'feitas', 'todas'] as Filtro[]).map((f) => <button key={f} type="button" role="tab" aria-selected={filtro === f} className={filtro === f ? 'active' : ''} onClick={() => setFiltro(f)}>{f === 'pendentes' ? `Pendentes (${pendentes})` : f === 'feitas' ? 'Feitas' : 'Todas'}</button>)}</div>
      <div className="afz-seg" role="tablist" aria-label="Responsável">{(['todas', 'suzanne', 'glaucia'] as const).map((q) => <button key={q} type="button" role="tab" aria-selected={quem === q} className={quem === q ? 'active' : ''} onClick={() => setQuem(q)}>{q === 'todas' ? 'De todas' : RESP[q]}</button>)}</div>
    </div>
    <section className="afz-panel">
      {loading ? <p className="afz-empty"><Loader2 size={16} className="afz-spin" /> Carregando...</p>
        : lista.length === 0 ? <p className="afz-empty"><ListChecks size={18} /> {filtro === 'feitas' ? 'Nada marcado como feito ainda.' : 'Nenhum afazer pendente.'}</p>
        : <ul className="afz-list">{lista.map((t) => <li key={t.id} className={`${t.done_at ? 'done' : ''} ${t.atrasada ? 'late' : ''}`}>
          <label className="afz-check"><input type="checkbox" checked={!!t.done_at} onChange={() => marcar(t)} aria-label={`Marcar "${t.title}" como ${t.done_at ? 'não feito' : 'feito'}`} /><span /></label>
          <div className="afz-body">
            <b>{t.title}</b>
            {t.notes && <small className="afz-obs">{t.notes}</small>}
            <div className="afz-meta">
              <span className="afz-tag">{RESP[t.responsible]}</span>
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
