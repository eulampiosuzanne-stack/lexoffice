import { useEffect, useRef, useState } from 'react';

// Página pública de assinatura eletrônica com biometria facial (sem login).
const ENDPOINT = 'https://dcpwcuototomxoiszukt.supabase.co/functions/v1/signature-biometric-public';
const FACEAPI_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/dist/face-api.esm.js';
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/';
const FACE_LIMIT = 0.55;

type DocItem = { id: string; title: string; status?: string; pdf_url?: string | null; verification_code?: string | null };
type Info = { documents?: DocItem[]; status: string; title: string; signer_name?: string; signer_cpf_masked?: string; phone_masked?: string; pdf_url?: string | null; otp_verified?: boolean; verification_code?: string; signed_at?: string; face_attempts?: number; review_after?: number };
type Step = 'loading' | 'error' | 'doc' | 'otp' | 'idphoto' | 'selfie' | 'confirm' | 'sending' | 'done' | 'review';

let faceapiPromise: Promise<any> | null = null;
function loadFaceApi(): Promise<any> {
  if (!faceapiPromise) {
    faceapiPromise = (async () => {
      const fa: any = await import(/* @vite-ignore */ FACEAPI_URL);
      await fa.tf?.setBackend?.('webgl').catch?.(() => undefined);
      await fa.tf?.ready?.();
      await Promise.all([
        fa.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
        fa.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
        fa.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
        fa.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
      ]);
      return fa;
    })();
    faceapiPromise.catch(() => { faceapiPromise = null; });
  }
  return faceapiPromise;
}

async function call(body: Record<string, unknown>): Promise<any> {
  const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) throw new Error(d?.error || 'Falha de comunicação. Tente novamente.');
  return d;
}

function toJpeg(src: HTMLVideoElement | HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const w = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
  const h = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  if (ctx) ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
function ear(eye: any[]): number { return (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2 * dist(eye[0], eye[3])); }

export default function AssinarPublico() {
  const token = decodeURIComponent(window.location.pathname.replace(/^\/assinar\//, '').replace(/\/$/, ''));
  const [step, setStep] = useState<Step>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [readOk, setReadOk] = useState(false);
  const [openDoc, setOpenDoc] = useState(0);
  const [seen, setSeen] = useState<number[]>([0]);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [idPreview, setIdPreview] = useState('');
  const [idJpeg, setIdJpeg] = useState('');
  const [idDescriptor, setIdDescriptor] = useState<any>(null);
  const [selfieJpeg, setSelfieJpeg] = useState('');
  const [faceDistance, setFaceDistance] = useState<number | null>(null);
  const [challenge, setChallenge] = useState('');
  const [doneSteps, setDoneSteps] = useState<string[]>([]);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentBio, setConsentBio] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [faceAttempts, setFaceAttempts] = useState(0);
  const [reviewAllowed, setReviewAllowed] = useState(false);
  const [manualReview, setManualReview] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const d = await call({ token, action: 'open' });
        setInfo(d);
        if (d.status === 'signed') { setStep('done'); return; }
        if (d.status === 'pending_review') { setStep('review'); return; }
        setFaceAttempts(d.face_attempts || 0); setReviewAllowed((d.face_attempts || 0) >= (d.review_after || 2));
        setStep('doc');
        loadFaceApi().then(() => setModelsReady(true)).catch(() => undefined);
      } catch (e: any) { setError(e?.message || 'Link inválido.'); setStep('error'); }
    })();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    runRef.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function sendCode() {
    setBusy(true); setNotice(''); setError('');
    try { const d = await call({ token, action: 'send_otp' }); setCodeSent(true); setNotice(`Enviamos um código de 6 números para o WhatsApp ${d.phone_masked}.`); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function verifyCode(value = code) {
    if (value.length !== 6) return;
    setBusy(true); setError('');
    try { await call({ token, action: 'verify_otp', code: value }); setNotice(''); setStep('idphoto'); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function onIdFile(file: File | undefined) {
    if (!file) return;
    setError(''); setNotice('Analisando a foto do documento...'); setBusy(true); setIdDescriptor(null);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Não foi possível abrir a imagem.')); img.src = url; });
      const canvas = toJpeg(img, 1400);
      const jpeg = canvas.toDataURL('image/jpeg', 0.85);
      setIdPreview(jpeg); setIdJpeg(jpeg);
      const fa = await loadFaceApi(); setModelsReady(true);
      const dets: any[] = await fa.detectAllFaces(canvas, new fa.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withFaceDescriptors();
      if (!dets.length) throw new Error('Não encontramos o rosto na foto do documento. Tire outra foto, com boa luz, sem reflexo e mostrando a foto do documento por inteiro.');
      dets.sort((a: any, b: any) => b.detection.box.area - a.detection.box.area);
      setIdDescriptor(dets[0].descriptor);
      setNotice('Foto do documento validada.');
    } catch (e: any) { setError(e?.message || 'Falha ao analisar a foto.'); setNotice(''); }
    finally { setBusy(false); }
  }

  async function startSelfie() {
    setError(''); setNotice(''); setDoneSteps([]); setSelfieJpeg(''); setFaceDistance(null);
    setBusy(true);
    try {
      const fa = await loadFaceApi(); setModelsReady(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) throw new Error('Câmera indisponível.');
      v.srcObject = stream; await v.play();
      setBusy(false);
      await runLiveness(fa, v);
    } catch (e: any) {
      stopCamera(); setBusy(false);
      setError(e?.name === 'NotAllowedError' ? 'Você precisa permitir o uso da câmera para tirar a selfie.' : (e?.message || 'Não foi possível abrir a câmera.'));
    }
  }

  async function runLiveness(fa: any, v: HTMLVideoElement) {
    const my = ++runRef.current;
    const order = Math.random() < 0.5 ? ['blink', 'turn'] : ['turn', 'blink'];
    const labels: Record<string, string> = { blink: 'Pisque os olhos devagar', turn: 'Vire devagar o rosto para um dos lados', front: 'Agora olhe de frente para a câmera' };
    const names: Record<string, string> = { blink: 'piscar os olhos', turn: 'virar o rosto', front: 'olhar de frente' };
    const queue = [...order, 'front'];
    const passed: string[] = [];
    let idx = 0, closedSeen = false, frontFrames = 0, openBase = 0;
    const opts = new fa.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 });
    const started = Date.now();
    setChallenge(labels[queue[0]]);
    while (runRef.current === my && idx < queue.length) {
      if (Date.now() - started > 90000) { stopCamera(); setChallenge(''); setError('O tempo acabou. Toque em "Tentar de novo".'); return; }
      const dets: any[] = await fa.detectAllFaces(v, opts).withFaceLandmarks();
      if (runRef.current !== my) return;
      if (dets.length !== 1) { setNotice(dets.length ? 'Apenas uma pessoa deve aparecer na câmera.' : 'Posicione seu rosto dentro do círculo.'); await new Promise((r) => setTimeout(r, 120)); continue; }
      setNotice('');
      const d = dets[0], lm = d.landmarks, pts = lm.positions, box = d.detection.box;
      const e = (ear(lm.getLeftEye()) + ear(lm.getRightEye())) / 2;
      const r = (pts[30].x - box.x) / box.width;
      const cur = queue[idx];
      let ok = false;
      openBase = Math.max(openBase * 0.985, e);
      if (cur === 'blink') { if (openBase > 0.18 && e < openBase * 0.72) closedSeen = true; else if (closedSeen && e > openBase * 0.88) ok = true; }
      if (cur === 'turn') ok = r < 0.38 || r > 0.62;
      if (cur === 'front') { if (r > 0.42 && r < 0.58 && e > openBase * 0.8 && box.width > v.videoWidth * 0.2) frontFrames++; else frontFrames = 0; ok = frontFrames >= 4; }
      if (ok) {
        passed.push(names[cur]); idx++; closedSeen = false;
        setDoneSteps([...passed]);
        if (idx < queue.length) setChallenge(labels[queue[idx]]);
      }
      await new Promise((res) => setTimeout(res, 90));
    }
    if (runRef.current !== my) return;
    // A foto final só é aceita com os olhos abertos e o rosto de frente.
    // Se a pessoa piscar ou fechar os olhos na hora, tira outra automaticamente.
    setChallenge('Olhe para a câmera com os olhos bem abertos');
    const eyeMin = Math.max(0.17, openBase * 0.78);
    const ssd = new fa.SsdMobilenetv1Options({ minConfidence: 0.4 });
    let canvas: HTMLCanvasElement | null = null;
    let det: any = null;
    const shotStarted = Date.now();
    while (runRef.current === my && Date.now() - shotStarted < 20000) {
      const c = toJpeg(v, 720);
      const d: any = await fa.detectSingleFace(c, ssd).withFaceLandmarks().withFaceDescriptor();
      if (runRef.current !== my) return;
      if (d) {
        const eyes = (ear(d.landmarks.getLeftEye()) + ear(d.landmarks.getRightEye())) / 2;
        const rr = (d.landmarks.positions[30].x - d.detection.box.x) / d.detection.box.width;
        if (eyes >= eyeMin && rr > 0.4 && rr < 0.6) { canvas = c; det = d; break; }
        setNotice(eyes < eyeMin ? 'Mantenha os olhos abertos.' : 'Olhe de frente para a câmera.');
      } else {
        setNotice('Posicione seu rosto dentro do círculo.');
      }
      await new Promise((res) => setTimeout(res, 150));
    }
    if (runRef.current !== my) return;
    stopCamera();
    setNotice('');
    if (!canvas || !det) {
      setChallenge('');
      setError('Não conseguimos uma foto com os olhos abertos. Toque em "Tentar de novo" e olhe para a câmera com os olhos abertos.');
      return;
    }
    setChallenge('Conferindo seu rosto...');
    const jpeg = canvas.toDataURL('image/jpeg', 0.88);
    setSelfieJpeg(jpeg);
    const distance = fa.euclideanDistance(det.descriptor, idDescriptor);
    setFaceDistance(distance);
    setChallenge('');
    if (distance <= FACE_LIMIT) { setManualReview(false); setNotice('Identidade confirmada.'); setStep('confirm'); return; }
    await registerFaceFail();
  }

  // Selfie não bateu com a foto do documento (comum em RG antigo): conta a tentativa e,
  // a partir da 2ª, permite mandar para a conferência manual do escritório.
  async function registerFaceFail() {
    let allowed = reviewAllowed;
    try { const d = await call({ token, action: 'face_fail' }); setFaceAttempts(d.face_attempts || 0); allowed = Boolean(d.review_allowed); setReviewAllowed(allowed); } catch { /* segue */ }
    setError(allowed
      ? 'Não foi possível confirmar pelo reconhecimento automático. Isso é comum quando a foto do documento é antiga. Você pode tentar de novo ou enviar para o escritório conferir.'
      : 'A selfie não ficou parecida com a foto do documento. Tente de novo em um lugar bem iluminado, olhando para a câmera.');
  }

  async function sign() {
    setBusy(true); setError(''); setStep('sending');
    let geo: any = null;
    try {
      geo = await new Promise((res) => {
        if (!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => res(null), { timeout: 8000, maximumAge: 60000 });
      });
    } catch { geo = null; }
    try {
      const d = await call({ token, action: 'submit', manual_review: manualReview, consent_terms: consentTerms, consent_biometrics: consentBio, face_distance: faceDistance, liveness: { passed: true, steps: doneSteps }, selfie_jpeg: selfieJpeg, id_photo_jpeg: idJpeg, geo, user_agent: navigator.userAgent });
      if (d.status === 'pending_review') { setStep('review'); return; }
      setInfo((i) => (i ? { ...i, status: 'signed', verification_code: d.verification_code, signed_at: d.signed_at, documents: Array.isArray(d.documents) ? d.documents : i.documents } : i));
      setStep('done');
    } catch (e: any) { setError(e.message); setStep('confirm'); } finally { setBusy(false); }
  }

  const stepIndex: Record<string, number> = { doc: 1, otp: 2, idphoto: 3, selfie: 4, confirm: 5, sending: 5 };
  const n = stepIndex[step] || 0;
  const firstName = (info?.signer_name || '').split(' ')[0];
  const docs: DocItem[] = info?.documents?.length ? info.documents : info ? [{ id: 'd', title: info.title, pdf_url: info.pdf_url, verification_code: info.verification_code }] : [];
  const many = docs.length > 1;
  const cur = docs[openDoc] || docs[0];
  const allSeen = !many || docs.every((_, i) => seen.includes(i));
  const pick = (i: number) => { setOpenDoc(i); setSeen((s) => (s.includes(i) ? s : [...s, i])); };

  return (
    <div className="lxs-page">
      <style>{CSS}</style>
      <div className="lxs-card">
        <header className="lxs-head">
          <div className="lxs-logo">SF</div>
          <div><b>SUZANNE FIGUEIREDO</b><small>Advocacia e Soluções Jurídicas</small></div>
        </header>

        {step === 'loading' && <p className="lxs-muted">Carregando...</p>}
        {step === 'error' && <div className="lxs-box lxs-err"><h2>Não foi possível abrir</h2><p>{error}</p><p className="lxs-muted">Em caso de dúvida, fale com o escritório pelo WhatsApp (31) 99298-4141.</p></div>}

        {info && n > 0 && <>
          <h1>{many ? 'Assinatura de documentos' : 'Assinatura de documento'}</h1>
          <p className="lxs-doc">{info.title}</p>
          <div className="lxs-steps">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i < n ? 'done' : i === n ? 'on' : ''} />)}</div>
        </>}

        {step === 'doc' && info && <div className="lxs-box">
          <h2>1. {many ? `Leia os ${docs.length} documentos` : 'Leia o documento'}</h2>
          <p>Olá{firstName ? `, ${firstName}` : ''}! {many ? 'Você vai assinar todos de uma vez só. Toque em cada um para ler antes de assinar.' : 'Antes de assinar, leia o documento com atenção.'}</p>
          {many && <div className="lxs-doclist">{docs.map((d, i) => (
            <button key={d.id} type="button" className={`lxs-docbtn ${i === openDoc ? 'on' : ''}`} onClick={() => pick(i)}>
              <span className="lxs-docnum">{seen.includes(i) ? '✓' : i + 1}</span><span className="lxs-doctitle">{d.title}</span>
            </button>
          ))}</div>}
          {cur?.pdf_url && <a className="lxs-btn lxs-ghost" href={cur.pdf_url} target="_blank" rel="noreferrer">{many ? `Abrir "${cur.title}" (PDF)` : 'Abrir o documento (PDF)'}</a>}
          {cur?.pdf_url && <iframe key={cur.id} className="lxs-pdf" src={cur.pdf_url} title={cur.title} />}
          {many && openDoc < docs.length - 1 && <button type="button" className="lxs-btn lxs-ghost" onClick={() => pick(openDoc + 1)}>Próximo documento ({openDoc + 2} de {docs.length})</button>}
          {many && !allSeen && <p className="lxs-muted">Abra todos os documentos da lista para poder continuar.</p>}
          <label className="lxs-check"><input type="checkbox" checked={readOk} disabled={!allSeen} onChange={(e) => setReadOk(e.target.checked)} /> {many ? `Li os ${docs.length} documentos e concordo com o conteúdo de todos.` : 'Li o documento e concordo com o seu conteúdo.'}</label>
          <button className="lxs-btn" disabled={!readOk || !allSeen} onClick={() => setStep(info.otp_verified ? 'idphoto' : 'otp')}>Continuar</button>
        </div>}

        {step === 'otp' && <div className="lxs-box">
          <h2>2. Confirme seu WhatsApp</h2>
          {!codeSent ? <>
            <p>Vamos mandar agora um código de 6 números para o seu WhatsApp {info?.phone_masked}.</p>
            <button className="lxs-btn" disabled={busy} onClick={sendCode}>{busy ? 'Enviando...' : 'Receber o código no WhatsApp'}</button>
          </> : <>
            <p>Abra o WhatsApp, veja o código que chegou e digite os 6 números aqui. A conferência é automática.</p>
            <input className="lxs-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus value={code} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6 && !busy) verifyCode(v); }} />
            <button className="lxs-btn" disabled={busy || code.length !== 6} onClick={() => verifyCode()}>{busy ? 'Conferindo...' : 'Confirmar código'}</button>
            <button className="lxs-link" disabled={busy} onClick={sendCode}>Não recebi, enviar de novo</button>
          </>}
        </div>}

        {step === 'idphoto' && <div className="lxs-box">
          <h2>3. Foto do seu documento</h2>
          <p>Tire uma foto da <b>frente do seu RG ou da CNH</b>, onde aparece a sua foto. Use um lugar bem iluminado, sem reflexo, com o documento inteiro na imagem.</p>
          <label className="lxs-btn lxs-ghost">{idPreview ? 'Tirar outra foto' : 'Fotografar documento'}<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onIdFile(e.target.files?.[0])} /></label>
          {idPreview && <img className="lxs-idprev" src={idPreview} alt="Documento" />}
          {!modelsReady && <p className="lxs-muted">Preparando o reconhecimento facial...</p>}
          <button className="lxs-btn" disabled={busy || !idDescriptor} onClick={() => { setNotice(''); setStep('selfie'); }}>Continuar</button>
        </div>}

        {step === 'selfie' && <div className="lxs-box">
          <h2>4. Selfie com prova de vida</h2>
          <p>Vamos abrir a câmera frontal. Siga as instruções que aparecerem na tela.</p>
          <div className="lxs-cam"><video ref={videoRef} playsInline muted />{challenge && <div className="lxs-challenge">{challenge}</div>}<div className="lxs-ring" /></div>
          {doneSteps.length > 0 && <p className="lxs-ok">✓ {doneSteps.join(' • ')}</p>}
          {!streamRef.current && <button className="lxs-btn" disabled={busy} onClick={startSelfie}>{busy ? 'Abrindo câmera...' : selfieJpeg || error ? 'Tentar de novo' : 'Abrir câmera'}</button>}
          {error && reviewAllowed && selfieJpeg && <button className="lxs-btn lxs-ghost" onClick={() => { setError(''); setNotice(''); setManualReview(true); setStep('confirm'); }}>Enviar para o escritório conferir</button>}
          {error && <button className="lxs-link" onClick={() => { setError(''); setStep('idphoto'); }}>Tirar outra foto do documento</button>}
          {faceAttempts > 0 && !reviewAllowed && <p className="lxs-muted">Tentativa {faceAttempts}. Se não der certo na próxima, você poderá enviar para o escritório conferir.</p>}
        </div>}

        {(step === 'confirm' || step === 'sending') && <div className="lxs-box">
          <h2>5. Confirmar assinatura</h2>
          <div className="lxs-faces">{selfieJpeg && <img src={selfieJpeg} alt="Selfie" />}{idPreview && <img src={idPreview} alt="Documento" />}</div>
          {manualReview
            ? <p className="lxs-muted">As fotos serão conferidas pessoalmente pelo escritório. Você receberá a confirmação pelo WhatsApp.</p>
            : <p className="lxs-ok">✓ Identidade confirmada por reconhecimento facial</p>}
          <label className="lxs-check"><input type="checkbox" checked={consentTerms} onChange={(e) => setConsentTerms(e.target.checked)} /> Concordo em assinar eletronicamente {many ? `estes ${docs.length} documentos` : 'este documento'} e reconheço esta assinatura como válida, nos termos da Lei nº 14.063/2020.</label>
          <label className="lxs-check"><input type="checkbox" checked={consentBio} onChange={(e) => setConsentBio(e.target.checked)} /> Autorizo o uso da minha imagem e dos meus dados biométricos exclusivamente para comprovar a autoria desta assinatura (LGPD, art. 11).</label>
          <button className="lxs-btn" disabled={busy || !consentTerms || !consentBio} onClick={sign}>{step === 'sending' ? 'Enviando...' : manualReview ? 'Assinar e enviar para conferência' : many ? `Assinar os ${docs.length} documentos` : 'Assinar documento'}</button>
        </div>}

        {step === 'review' && <div className="lxs-box lxs-done">
          <div className="lxs-check-big" style={{ background: '#b88a3a' }}>✓</div>
          <h2>Assinatura recebida!</h2>
          <p>Recebemos sua assinatura{many ? <> nos <b>{docs.length} documentos</b></> : info?.title ? <> em <b>{info.title}</b></> : ''}. Como a foto do documento ficou diferente da selfie, o escritório vai conferir pessoalmente.</p>
          <p className="lxs-muted">Você receberá a confirmação pelo WhatsApp. Já pode fechar esta página.</p>
        </div>}

        {step === 'done' && <div className="lxs-box lxs-done">
          <div className="lxs-check-big">✓</div>
          <h2>{many ? 'Documentos assinados!' : 'Documento assinado!'}</h2>
          {many ? <>
            <p>Sua assinatura foi registrada com sucesso em todos os documentos:</p>
            <ul className="lxs-donelist">{docs.map((d) => <li key={d.id}><b>{d.title}</b>{d.verification_code ? <span className="lxs-muted"> • código {d.verification_code}</span> : null}</li>)}</ul>
          </> : <>
            <p>Sua assinatura em <b>{info?.title}</b> foi registrada com sucesso.</p>
            {info?.verification_code && <p className="lxs-muted">Código de verificação: <b>{info.verification_code}</b></p>}
          </>}
          <p className="lxs-muted">Você já pode fechar esta página. O escritório recebeu a via assinada.</p>
        </div>}

        {notice && step !== 'done' && <p className="lxs-notice">{notice}</p>}
        {error && step !== 'error' && <p className="lxs-error">{error}</p>}
        <footer className="lxs-foot">Assinatura eletrônica com validação biométrica • Seus dados são protegidos pela LGPD</footer>
      </div>
    </div>
  );
}

const CSS = `
.lxs-page{min-height:100vh;background:#f5f1ec;display:flex;justify-content:center;padding:18px 12px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#2a2124}
.lxs-card{width:100%;max-width:560px;background:#fff;border-radius:18px;box-shadow:0 10px 40px rgba(60,20,30,.12);padding:22px 20px 16px}
.lxs-head{display:flex;gap:12px;align-items:center;border-bottom:1px solid #e8dccb;padding-bottom:14px;margin-bottom:16px}
.lxs-logo{width:42px;height:42px;border-radius:50%;background:#6e1930;color:#e9d3a6;display:grid;place-items:center;font-weight:700;font-family:Georgia,serif}
.lxs-head b{display:block;color:#6e1930;letter-spacing:.04em;font-size:15px}.lxs-head small{color:#8a7a70;font-size:12px}
.lxs-card h1{font-size:20px;margin:0 0 4px;color:#2a2124}.lxs-doc{margin:0 0 12px;color:#6e1930;font-weight:600}
.lxs-steps{display:flex;gap:6px;margin-bottom:14px}.lxs-steps span{flex:1;height:5px;border-radius:4px;background:#ece3d8}.lxs-steps .done{background:#b88a3a}.lxs-steps .on{background:#6e1930}
.lxs-box{display:flex;flex-direction:column;gap:12px}.lxs-box h2{font-size:17px;margin:4px 0 0;color:#6e1930}.lxs-box p{margin:0;line-height:1.5;font-size:15px}
.lxs-btn{appearance:none;border:0;border-radius:12px;background:#6e1930;color:#fff;font-size:16px;font-weight:600;padding:14px 16px;text-align:center;cursor:pointer;text-decoration:none;display:block}
.lxs-btn:disabled{opacity:.45;cursor:not-allowed}.lxs-ghost{background:#fff;color:#6e1930;border:1.5px solid #6e1930}
.lxs-link{background:none;border:0;color:#6e1930;text-decoration:underline;font-size:14px;padding:4px;cursor:pointer}
.lxs-input{font-size:26px;letter-spacing:.35em;text-align:center;padding:12px;border:1.5px solid #d9c9b4;border-radius:12px;outline:none}
.lxs-check{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45}.lxs-check input{width:20px;height:20px;margin-top:2px;accent-color:#6e1930;flex:none}
.lxs-pdf{width:100%;height:340px;border:1px solid #e8dccb;border-radius:10px;background:#faf7f3}
.lxs-idprev{width:100%;max-height:260px;object-fit:contain;border-radius:10px;border:1px solid #e8dccb;background:#faf7f3}
.lxs-cam{position:relative;width:100%;aspect-ratio:3/4;background:#1d1417;border-radius:14px;overflow:hidden}
.lxs-cam video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.lxs-ring{position:absolute;left:50%;top:44%;width:62%;aspect-ratio:3/4;transform:translate(-50%,-50%);border:3px dashed rgba(233,211,166,.85);border-radius:50%;pointer-events:none}
.lxs-challenge{position:absolute;left:10px;right:10px;bottom:12px;background:rgba(110,25,48,.92);color:#fff;border-radius:10px;padding:10px;text-align:center;font-weight:600;font-size:16px}
.lxs-faces{display:flex;gap:10px}.lxs-faces img{flex:1;min-width:0;height:160px;object-fit:cover;border-radius:10px;border:1px solid #e8dccb}
.lxs-ok{color:#1f6b38;font-weight:600;font-size:14px}.lxs-notice{color:#6b5d55;font-size:14px;margin:12px 0 0;text-align:center}
.lxs-error,.lxs-err p{color:#a3182f;font-size:14px;margin:12px 0 0;text-align:center}.lxs-muted{color:#8a7a70;font-size:13px}
.lxs-done{align-items:center;text-align:center;padding:12px 0}.lxs-check-big{width:64px;height:64px;border-radius:50%;background:#1f6b38;color:#fff;display:grid;place-items:center;font-size:34px}
.lxs-doclist{display:flex;flex-direction:column;gap:6px}
.lxs-docbtn{display:flex;gap:10px;align-items:center;text-align:left;width:100%;border:1.5px solid #e8dccb;background:#faf7f3;border-radius:12px;padding:12px;font-size:15px;color:#2a2124;cursor:pointer}
.lxs-docbtn.on{border-color:#6e1930;background:#fff}
.lxs-docnum{flex:none;width:28px;height:28px;border-radius:50%;background:#ece3d8;color:#6e1930;display:grid;place-items:center;font-weight:700;font-size:14px}
.lxs-docbtn.on .lxs-docnum{background:#6e1930;color:#fff}
.lxs-doctitle{min-width:0;overflow:hidden;text-overflow:ellipsis}
.lxs-donelist{text-align:left;margin:0;padding-left:18px;font-size:14px;line-height:1.6;align-self:stretch}
.lxs-foot{margin-top:18px;border-top:1px solid #efe6da;padding-top:10px;font-size:11px;color:#9a8b80;text-align:center}
`;
