import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createAuthClient } from '@neon/auth';
import { BetterAuthVanillaAdapter } from '@neon/auth/vanilla/adapters';

const base = import.meta.env.VITE_LEX_CONTINGENCY_AUTH_URL as string | undefined;
type ContingencyAuth = ReturnType<typeof createAuthClient> & {
  token(): Promise<{ data: { token?: string } | null }>;
  emailOtp: { sendVerificationOtp(input: { email: string; type: 'sign-in' }): Promise<{ error?: unknown }> };
  signIn: { emailOtp(input: { email: string; otp: string }): Promise<{ error?: unknown }> };
};
// This SDK release ships the plugins at runtime but omits their methods from its declarations.
const auth = base ? createAuthClient(base, { adapter: BetterAuthVanillaAdapter() }) as ContingencyAuth : null;

const views = {
  clients: { title: 'Clientes', fields: [['name', 'Nome'], ['status', 'Situação']] },
  processes: { title: 'Processos', fields: [['cnj_number', 'Número CNJ'], ['subject', 'Assunto'], ['status', 'Situação']] },
  agenda: { title: 'Agenda', fields: [['title', 'Compromisso'], ['starts_at', 'Início'], ['status', 'Situação']] },
  finance: { title: 'Financeiro', fields: [['description', 'Descrição'], ['amount', 'Valor'], ['due_date', 'Vencimento'], ['status', 'Situação']] },
} as const;
type View = keyof typeof views;
type Row = Record<string, string | null>;

const panel = { background: '#fff', color: '#242321', padding: 'clamp(1rem, 4vw, 2rem)', maxWidth: '58rem', margin: '2rem auto', borderRadius: '1rem' };
const button = { background: '#65001f', color: '#fff', minHeight: '3rem', padding: '0.6rem 1rem', borderRadius: '0.5rem', fontSize: '1rem' };

function display(key: string, value: string | null) {
  if (!value) return '—';
  if (key === 'amount') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
  if (key === 'starts_at') return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
  if (key === 'due_date') return value.slice(0, 10).split('-').reverse().join('/');
  return value;
}

export default function Contingency() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<View>('clients');
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const serial = useRef(0);

  async function load(target: View, start = 0) {
    if (!auth) return;
    const run = ++serial.current;
    setBusy(true);
    setMessage('');
    setRows([]);
    setMore(false);
    setView(target);
    setOffset(start);
    try {
      const { data } = await auth.token();
      if (!data?.token) { setSignedIn(false); return; }
      const params = new URLSearchParams({ auth: 'contingency', resource: target, limit: '50', offset: String(start) });
      const response = await fetch('/api/lex-recovery-preview?' + params, {
        headers: { Authorization: 'Bearer ' + data.token },
        cache: 'no-store',
      });
      if (run !== serial.current) return;
      if (response.status === 403) {
        await auth.signOut();
        setSignedIn(false);
        setSent(false);
        setMessage('Este e-mail não tem permissão para o acesso de contingência.');
        return;
      }
      if (response.status === 401) {
        setSignedIn(false);
        setSent(false);
        setMessage('Sua sessão expirou. Solicite um novo código.');
        return;
      }
      if (!response.ok) throw Error('Consulta indisponível.');
      const dataRows = await response.json() as { rows: Row[]; hasMore: boolean };
      if (run !== serial.current) return;
      setRows(dataRows.rows);
      setMore(dataRows.hasMore);
      setSignedIn(true);
    } catch {
      if (run === serial.current) setMessage('Não foi possível consultar agora. Tente novamente.');
    } finally {
      if (run === serial.current) setBusy(false);
    }
  }

  useEffect(() => { if (auth) void load('clients'); return () => { serial.current++; }; }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setBusy(true);
    setMessage('');
    try {
      const address = email.trim().toLowerCase();
      if (!sent) {
        const { error } = await auth.emailOtp.sendVerificationOtp({ email: address, type: 'sign-in' });
        if (error) throw error;
        setSent(true);
        setMessage('Confira sua caixa de entrada e a pasta de spam.');
      } else {
        const { error } = await auth.signIn.emailOtp({ email: address, otp: otp.trim() });
        if (error) throw error;
        setOtp('');
        await load('clients');
      }
    } catch {
      setMessage(sent ? 'Código inválido ou expirado. Confira o código ou solicite outro.' : 'Não foi possível enviar o código agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!auth) return;
    ++serial.current;
    setRows([]);
    setSignedIn(false);
    setSent(false);
    setOtp('');
    setBusy(true);
    try {
      const { error } = await auth.signOut();
      setMessage(error ? 'Não foi possível encerrar a sessão no servidor. Feche o navegador.' : '');
    } catch {
      setMessage('Não foi possível encerrar a sessão no servidor. Feche o navegador.');
    } finally {
      setBusy(false);
    }
  }

  return <main style={panel}>
    <h1>LexOffice · Acesso de contingência</h1>
    <p>Consulta temporária aos dados recuperados, somente para leitura.</p>
    {message && <p role="status">{message}</p>}
    {!auth ? <p role="alert">O acesso de contingência ainda está sendo configurado.</p> : !signedIn ?
      <form onSubmit={login} style={{ display: 'grid', gap: '1rem', maxWidth: '30rem' }}>
        <label>E-mail já cadastrado na LexOffice
          <input style={{ display: 'block', width: '100%', minHeight: '3rem' }} type="email" autoComplete="email" required value={email} disabled={busy || sent} onChange={e => setEmail(e.target.value)} />
        </label>
        {sent && <label>Código recebido por e-mail
          <input style={{ display: 'block', width: '100%', minHeight: '3rem' }} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={otp} disabled={busy} onChange={e => setOtp(e.target.value)} />
        </label>}
        <button style={button} disabled={busy}>{busy ? 'Aguarde…' : sent ? 'Entrar' : 'Receber código'}</button>
        {sent && <button type="button" style={button} disabled={busy} onClick={() => { setSent(false); setOtp(''); setMessage(''); }}>Solicitar outro código</button>}
      </form> :
      <>
        <nav aria-label="Consultas" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(Object.keys(views) as View[]).map(key => <button key={key} style={button} disabled={busy} aria-pressed={view === key} onClick={() => void load(key)}>{views[key].title}</button>)}
          <button style={button} disabled={busy} onClick={() => void leave()}>Sair</button>
        </nav>
        <h2>{views[view].title}</h2>
        {busy ? <p role="status">Carregando…</p> : rows.length ? <div style={{ overflowX: 'auto' }}>
          <table><thead><tr>{views[view].fields.map(([key, label]) => <th key={key} scope="col" style={{ padding: '0.6rem', textAlign: 'left' }}>{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>{views[view].fields.map(([key]) => <td key={key} style={{ padding: '0.6rem' }}>{display(key, row[key])}</td>)}</tr>)}</tbody></table>
        </div> : <p>Nenhum registro disponível.</p>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          {offset > 0 && <button style={button} disabled={busy} onClick={() => void load(view, offset - 50)}>Anterior</button>}
          {more && <button style={button} disabled={busy} onClick={() => void load(view, offset + 50)}>Próxima</button>}
        </div>
      </>}
  </main>;
}
