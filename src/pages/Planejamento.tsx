import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Landmark, Receipt, Building2, Copy, RotateCcw, Calculator } from 'lucide-react';
import { CALCS, calcular, type CalcKey } from '../lib/planejamento';
import './planejamento.css';

const KEYS: CalcKey[] = ['prev', 'trib', 'pat'];
const ICONS = { prev: Landmark, trib: Receipt, pat: Building2 } as const;
const store = {
  get(k: string) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
};
const initialTab = (): CalcKey => {
  const h = window.location.hash.slice(1) as CalcKey; if (KEYS.includes(h)) return h;
  const s = store.get('lex-plan-tab'); return KEYS.includes(s) ? s : 'prev';
};

export default function Planejamento() {
  const [tab, setTab] = useState<CalcKey>(initialTab);
  const [values, setValues] = useState<Record<string, string>>(() => store.get('lex-plan-' + initialTab()) || CALCS[initialTab()].example);
  const [isExample, setIsExample] = useState(() => !store.get('lex-plan-' + initialTab()));
  const [submitted, setSubmitted] = useState<Record<string, string>>(values);
  const [copied, setCopied] = useState(false);
  const calc = CALCS[tab];

  function switchTab(k: CalcKey) {
    setTab(k); store.set('lex-plan-tab', k); window.history.replaceState(null, '', '#' + k);
    const saved = store.get('lex-plan-' + k); const v = saved || CALCS[k].example;
    setValues(v); setSubmitted(v); setIsExample(!saved); setCopied(false);
  }
  useEffect(() => { const onHash = () => { const h = window.location.hash.slice(1) as CalcKey; if (KEYS.includes(h) && h !== tab) switchTab(h); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); });

  const out = useMemo(() => calcular(tab, submitted), [tab, submitted]);
  function submit(e: FormEvent) { e.preventDefault(); store.set('lex-plan-' + tab, values); setIsExample(false); setSubmitted({ ...values }); setCopied(false); }
  function reset() { store.del('lex-plan-' + tab); setValues(calc.example); setSubmitted(calc.example); setIsExample(true); setCopied(false); }
  async function copy() { if (!out.ok) return; try { await navigator.clipboard.writeText(out.texto); setCopied(true); } catch { setCopied(false); } }

  return <div className="plan-page">
    <div className="page-title"><h1>Planejamento</h1><p>Régua previdenciária e planejamento tributário e patrimonial com as regras de 2026. Resultados são estimativas de apoio e devem ser conferidos juridicamente.</p></div>
    <div className="plan-tabs" role="tablist" aria-label="Tipo de planejamento">
      {KEYS.map((k) => { const I = ICONS[k]; return <button key={k} type="button" role="tab" aria-selected={k === tab} className={k === tab ? 'active' : ''} onClick={() => switchTab(k)}><I size={16} />{CALCS[k].aba}</button>; })}
    </div>
    <div className="plan-grid">
      <section className="plan-panel">
        <form onSubmit={submit} noValidate>
          {calc.fields.map((f) => { const id = `plan-${tab}-${f.key}`; const v = values[f.key] ?? ''; const on = (val: string) => setValues((p) => ({ ...p, [f.key]: val }));
            return <label key={id} htmlFor={id}>{f.label}{f.type === 'select'
              ? <select id={id} value={v} onChange={(e) => on(e.target.value)}>{f.options!.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>
              : <input id={id} type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={v} onChange={(e) => on(e.target.value)} />}</label>; })}
          {isExample && <p className="plan-example">Exemplo preenchido. Troque pelos dados do cliente.</p>}
          <div className="plan-actions"><button className="plan-btn" type="submit"><Calculator size={15} />Calcular</button><button className="plan-btn ghost" type="button" onClick={reset}><RotateCcw size={15} />Voltar ao exemplo</button></div>
        </form>
      </section>
      <section className="plan-panel plan-result" aria-live="polite">
        <div className="plan-result-head"><div><h2>{calc.nome}</h2>{out.ok && <p>Memória de cálculo com os dados informados.</p>}</div>{out.ok && <button className="plan-btn ghost small" type="button" onClick={copy}><Copy size={14} />{copied ? 'Copiado' : 'Copiar memória'}</button>}</div>
        {!out.ok ? <p className="plan-error">{out.erro}</p> : <>
          {out.resumo.length > 0 && <div className="plan-verdict">{out.resumo.map(([t, v]) => <div key={t}><span>{t}</span><b>{v}</b></div>)}</div>}
          <div className="plan-tablewrap"><table><tbody>
            {out.rows.map((r, i) => r.sep
              ? (i > 0 ? <tr key={i} className="section"><td colSpan={2} /></tr> : null)
              : <tr key={i} className={/^TOTAL/i.test(r.label!) ? 'total' : /não se aplica/.test(r.value!) ? 'na' : ''}><td>{r.label}</td><td>{r.value}</td></tr>)}
          </tbody></table></div>
          {out.notes.length > 0 && <ul className="plan-notes">{out.notes.map((n) => <li key={n} className={/^Atenção/.test(n) ? '' : 'obs'}>{n}</li>)}</ul>}
        </>}
      </section>
    </div>
    <p className="plan-foot">Parâmetros 2026: salário mínimo R$ 1.621,00; teto do INSS R$ 8.475,55; IR com isenção até R$ 5.000 (Lei 15.270/2025); IR de 10% sobre dividendos acima de R$ 50 mil/mês; presunção do Lucro Presumido +10% acima de R$ 5 milhões/ano (LC 224/2025); ITCD de MG 5%. Os dados digitados ficam só neste navegador.</p>
  </div>;
}
