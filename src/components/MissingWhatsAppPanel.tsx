import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Save, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Row = { id: string; name: string; processos: number };

/** Normaliza para o formato usado no WhatsApp do sistema: só dígitos, com 55 na frente. Devolve '' se inválido. */
export function normalizarWhatsApp(v: string): string {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) return '55' + d;
  return '';
}

/** Clientes com processo e sem WhatsApp: sem o número, a LEX não consegue avisar andamentos, audiências e cobranças. */
export default function MissingWhatsAppPanel({ onSaved }: { onSaved?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('processes').select('client_id,clients!inner(id,name,phone,whatsapp)').not('client_id', 'is', null).limit(2000);
    if (error) return;
    const map = new Map<string, Row>();
    for (const p of (data || []) as any[]) {
      const c = Array.isArray(p.clients) ? p.clients[0] : p.clients;
      if (!c || String(c.whatsapp || '').trim() || String(c.phone || '').trim()) continue;
      const r = map.get(c.id) || { id: c.id, name: c.name || 'Cliente sem nome', processos: 0 };
      r.processos++; map.set(c.id, r);
    }
    setRows([...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  }
  useEffect(() => { load(); }, []);

  async function salvar(r: Row) {
    const numero = normalizarWhatsApp(values[r.id] || '');
    if (!numero) { setMsg({ id: r.id, text: 'Número inválido. Use DDD + número, ex.: 31 99999-8888.', ok: false }); return; }
    if (!supabase) return;
    setBusy(r.id); setMsg(null);
    const { data, error } = await supabase.from('clients').update({ whatsapp: numero, updated_at: new Date().toISOString() }).eq('id', r.id).select('id');
    setBusy('');
    if (error || !data?.length) { setMsg({ id: r.id, text: 'Não foi possível salvar (sem permissão para este cliente ou erro de conexão).', ok: false }); return; }
    setRows((x) => x.filter((y) => y.id !== r.id));
    setMsg({ id: '', text: `WhatsApp de ${r.name} salvo. Os próximos avisos já vão para esse número.`, ok: true });
    onSaved?.();
  }

  if (!rows.length && !msg?.ok) return null;
  return <section className="integration-panel missing-wa-panel" style={{ marginBottom: 14 }}>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left', font: 'inherit' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={17} color="#F2C56D" /><b>{rows.length ? `${rows.length} cliente(s) com processo estão sem WhatsApp` : 'Cadastros de WhatsApp em dia'}</b></span>
      {rows.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#BDB4A6' }}>{open ? 'Fechar' : 'Completar agora'}{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>}
    </button>
    {msg?.ok && <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 0', color: '#F2C56D', fontWeight: 700 }}><CheckCircle2 size={15} />{msg.text}</p>}
    {open && rows.length > 0 && <>
      <p style={{ margin: '10px 0', color: '#BDB4A6', fontSize: 13 }}>Sem o número, a LEX não consegue mandar andamentos, audiências e cobranças para esses clientes.</p>
      <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
        {rows.map((r) => <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #2E2216', borderRadius: 10, background: '#100C08' }}>
          <span style={{ flex: '1 1 220px', minWidth: 0 }}><b style={{ color: '#F5F1E8' }}>{r.name}</b><small style={{ display: 'block', color: '#BDB4A6' }}>{r.processos} processo(s)</small></span>
          <input aria-label={`WhatsApp de ${r.name}`} inputMode="tel" placeholder="DDD + número" value={values[r.id] || ''} onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') salvar(r); }} style={{ flex: '0 1 190px', minWidth: 150, border: '1px solid #2E2216', borderRadius: 10, background: '#080705', color: '#F5F1E8', padding: '8px 10px', font: 'inherit' }} />
          <button type="button" className="secondary" onClick={() => salvar(r)} disabled={busy === r.id}>{busy === r.id ? <Loader2 size={14} /> : <Save size={14} />} Salvar</button>
          {msg && !msg.ok && msg.id === r.id && <small role="alert" style={{ flexBasis: '100%', color: '#F2C56D' }}>{msg.text}</small>}
        </div>)}
      </div>
    </>}
  </section>;
}
