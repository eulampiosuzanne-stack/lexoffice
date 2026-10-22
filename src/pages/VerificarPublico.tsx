import './VerificarPublico.visual.css';
import { useEffect, useState } from 'react';

// Página pública de verificação de documentos assinados pela LEXOFFICE (sem login).
// Acessada pelo QR code do certificado ou digitando o código impresso no rodapé do documento.
const ENDPOINT = 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/signature-biometric-public';

type Result = {
  found: boolean; code?: string; title?: string; signer_name?: string; signer_cpf_masked?: string | null;
  signed_at?: string; signed_sha256?: string; source_sha256?: string; method?: string; manual_review?: boolean;
  timestamp?: { provider: string; gen_time: string | null } | null;
};

const fmt = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso)) : '—');
function normalize(v: string) {
  const raw = v.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 10);
  return raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
}
async function sha256File(file: File) {
  const d = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function VerificarPublico() {
  const fromUrl = decodeURIComponent(window.location.pathname.replace(/^\/verificar\/?/, '').replace(/\/$/, ''));
  const [code, setCode] = useState(normalize(fromUrl));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [fileCheck, setFileCheck] = useState<'' | 'ok' | 'diff' | 'checking'>('');

  async function verify(value = code) {
    const c = normalize(value);
    setCode(c); setError(''); setRes(null); setFileCheck('');
    if (c.replace('-', '').length !== 10) { setError('O código tem 10 caracteres, como ABCDE-12345. Ele aparece no rodapé de cada página do documento.'); return; }
    setBusy(true);
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', code: c }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.error) throw new Error(d?.error || 'Não foi possível verificar agora. Tente novamente.');
      setRes(d);
      if (window.location.pathname !== `/verificar/${c}`) window.history.replaceState(null, '', `/verificar/${c}`);
    } catch (e: any) { setError(e?.message || 'Falha de comunicação.'); }
    finally { setBusy(false); }
  }

  async function onFile(f?: File) {
    if (!f || !res?.signed_sha256) return;
    setFileCheck('checking');
    try { setFileCheck((await sha256File(f)) === res.signed_sha256 ? 'ok' : 'diff'); }
    catch { setFileCheck('diff'); }
  }

  useEffect(() => { if (fromUrl) verify(fromUrl); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="lxs-page">

      <div className="lxs-card">
        <header className="lxs-head">
          <div className="lxs-logo">SF</div>
          <div><b>SUZANNE FIGUEIREDO</b><small>Advocacia e Soluções Jurídicas</small></div>
        </header>
        <h1>Verificar documento assinado</h1>
        <p className="lxs-muted" style={{ margin: '0 0 14px' }}>Digite o código de verificação que aparece no rodapé do documento ou leia o QR code da última página.</p>

        <form className="lxv-row" onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <input className="lxv-input" value={code} onChange={(e) => setCode(normalize(e.target.value))} placeholder="ABCDE-12345" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Código de verificação" />
          <button className="lxs-btn" disabled={busy}>{busy ? 'Verificando...' : 'Verificar'}</button>
        </form>

        {error && <p className="lxs-error">{error}</p>}

        {res && !res.found && <div className="lxv-result lxv-bad">
          <div className="lxv-icon">!</div>
          <div><h2>Documento não encontrado</h2><p>Não há documento assinado com o código <b>{code}</b>. Confira se digitou corretamente. Se o código estiver certo, este documento não foi assinado pela plataforma do escritório.</p></div>
        </div>}

        {res?.found && <>
          <div className="lxv-result lxv-good">
            <div className="lxv-icon">✓</div>
            <div><h2>Assinatura registrada</h2><p>Este código corresponde a um documento assinado eletronicamente pela plataforma do escritório.</p></div>
          </div>
          <dl className="lxv-dl">
            <dt>Documento</dt><dd>{res.title}</dd>
            <dt>Signatário</dt><dd>{res.signer_name}{res.signer_cpf_masked ? ` – CPF ${res.signer_cpf_masked}` : ''}</dd>
            <dt>Assinado em</dt><dd>{fmt(res.signed_at)} (horário de Brasília)</dd>
            <dt>Forma</dt><dd>{res.method}{res.manual_review ? '. Identidade conferida também pelo escritório.' : ''}</dd>
            <dt>Carimbo do tempo</dt><dd>{res.timestamp ? `${res.timestamp.provider}${res.timestamp.gen_time ? ` – ${fmt(res.timestamp.gen_time)}` : ''}` : 'Não registrado'}</dd>
            <dt>Código</dt><dd>{res.code}</dd>
            <dt>SHA-256 do arquivo assinado</dt><dd className="lxv-hash">{res.signed_sha256}</dd>
          </dl>

          <div className="lxv-file">
            <b>Conferir se o arquivo não foi alterado</b>
            <p className="lxs-muted">Selecione o PDF que você recebeu. A conferência é feita aqui no seu aparelho: o arquivo não é enviado a ninguém.</p>
            <label className="lxs-btn lxs-ghost">Escolher PDF<input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} /></label>
            {fileCheck === 'checking' && <p className="lxs-notice">Conferindo...</p>}
            {fileCheck === 'ok' && <p className="lxv-okmsg">✓ Arquivo íntegro: é exatamente o documento assinado, sem nenhuma alteração.</p>}
            {fileCheck === 'diff' && <p className="lxs-error">Este arquivo é diferente do documento assinado. Ele pode ter sido alterado, impresso e escaneado, ou ser outro documento.</p>}
          </div>
        </>}

        <footer className="lxs-foot">Suzanne Eulâmpio da Silva Figueiredo • OAB/MG 131.880 • (31) 99298-4141</footer>
      </div>
    </div>
  );
}
