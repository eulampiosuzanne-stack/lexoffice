// Clientes devendo (17/11/2026): no Início, a Dra. vê quem está em atraso e decide na hora —
// "Dar quitação" (encerra o débito e para a cobrança) ou "Mandar cobrança" (envia agora pelo WhatsApp).
// A régua automática continua cobrando sozinha (12, 21 e 30 dias). Dados: funções lex_debtors_panel,
// lex_debtor_settle e lex_debtor_send_collection (só a Dra. e advogadas podem agir).
import { useEffect, useState } from 'react';
import { CircleDollarSign, Send, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Item = { id: string; description: string; due_date: string; saldo: number; dias: number };
type Debtor = { client_id: string; name: string; phone?: string | null; saldo: number; atualizado: number; dias: number; parcelas: number; itens: Item[]; ultima_cobranca?: string | null };

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dt = (v?: string | null) => (v ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(v.length === 10 ? v + 'T12:00:00' : v)) : '—');

export default function DebtorsBoard() {
  const [list, setList] = useState<Debtor[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function load() {
    if (!supabase) return;
    const { data, error: e } = await supabase.rpc('lex_debtors_panel');
    if (e) { setError('Não foi possível carregar os clientes devendo.'); return; }
    setList(((data as any)?.items || []) as Debtor[]);
  }
  useEffect(() => { void load(); }, []);

  const fail = (e: any) => setError(String(e?.message || '').includes('not_authorized') ? 'Somente a Dra. ou advogadas podem fazer isso.' : 'Não foi possível concluir. Tente novamente.');

  async function settle(d: Debtor) {
    if (!supabase) return;
    if (!window.confirm(`Dar quitação para ${d.name}? As ${d.parcelas} parcela(s) em atraso (${brl(d.saldo)}) ficam como quitadas e a cobrança para.`)) return;
    setBusy(d.client_id); setError(''); setNotice('');
    const { error: e } = await supabase.rpc('lex_debtor_settle', { p_client: d.client_id, p_entry_ids: null });
    setBusy(null);
    if (e) { fail(e); return; }
    setNotice(`Quitação registrada para ${d.name}.`);
    await load();
  }

  async function charge(d: Debtor) {
    if (!supabase) return;
    setBusy(d.client_id); setError(''); setNotice('');
    const { data, error: e } = await supabase.rpc('lex_debtor_send_collection', { p_client: d.client_id });
    setBusy(null);
    if (e) { fail(e); return; }
    const r = String(data || '');
    setNotice(r === 'queued' ? `Cobrança de ${d.name} enviada para a fila (sai em instantes, em horário comercial).` : r === 'already_queued' ? `${d.name} já tem uma cobrança na fila desta última hora.` : r === 'no_phone' ? `${d.name} está sem WhatsApp cadastrado.` : 'Nada em aberto para cobrar.');
  }

  const items = list || [];
  const visible = showAll ? items : items.slice(0, 6);
  const total = items.reduce((s, d) => s + Number(d.atualizado || 0), 0);

  return (
    <section className="hc-panel hc-debtors" aria-labelledby="hc-debtors-title" style={{ marginTop: 24 }}>
      <header className="hc-panel-title">
        <div><span><CircleDollarSign size={21} /></span><div><h2 id="hc-debtors-title">Clientes devendo</h2><p>{list ? `${items.length} cliente(s) · ${brl(total)} atualizado` : 'Carregando…'}</p></div></div>
      </header>
      {error && <p className="hc-inline-error" role="alert">{error}</p>}
      {notice && <p role="status" style={{ margin: '8px 0', fontWeight: 600 }}>{notice}</p>}
      {list && items.length === 0 && <div className="hc-calm"><CheckCircle2 size={24} /><strong>Nenhum cliente com parcela em atraso.</strong></div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {visible.map((d) => (
          <li key={d.client_id} style={{ border: '1px solid var(--lx-border, #e5d9c8)', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setOpen(open === d.client_id ? null : d.client_id)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', minWidth: 0, flex: '1 1 220px' }} aria-expanded={open === d.client_id}>
                <strong style={{ display: 'block' }}>{d.name}</strong>
                <small>{d.parcelas} parcela(s) · {d.dias} dias de atraso · <b>{brl(d.atualizado)}</b> atualizado · última cobrança {dt(d.ultima_cobranca)}</small>
                {open === d.client_id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-secondary" disabled={busy === d.client_id} onClick={() => void settle(d)} style={{ minHeight: 40 }}><CheckCircle2 size={16} /> Dar quitação</button>
                <button type="button" className="primary" disabled={busy === d.client_id} onClick={() => void charge(d)} style={{ minHeight: 40 }}><Send size={16} /> Mandar cobrança</button>
              </div>
            </div>
            {open === d.client_id && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                {d.itens.map((i) => <li key={i.id}><small>{i.description} · venceu {dt(i.due_date)} · {brl(i.saldo)} ({i.dias} dias)</small></li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {items.length > 6 && <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostrar menos' : `Ver todos (${items.length})`}</button>}
    </section>
  );
}
