// Política de conferência manual da assinatura biométrica (pura, testada em scripts/test-signature-review.mjs).
export const MIN_FACE_ATTEMPTS_FOR_REVIEW = 2;
export const FAIL_KINDS = ['face', 'liveness', 'eyes'];
const STEP_NAMES = ['piscar os olhos', 'virar o rosto', 'virar o rosto para o outro lado', 'olhar de frente', 'foto com olhos abertos'];

// Qualquer falha (comparação facial, prova de vida, foto de olhos abertos) conta como tentativa.
export const nextAttempts = (current) => (Number(current) || 0) + 1;
export const reviewAllowed = (attempts) => (Number(attempts) || 0) >= MIN_FACE_ATTEMPTS_FOR_REVIEW;
export const cleanKind = (k) => (FAIL_KINDS.includes(k) ? k : 'face');

// Normaliza o que o aparelho informou sobre a prova de vida (nunca confia em texto livre).
export function sanitizeLiveness(l) {
  const pick = (arr) => (Array.isArray(arr) ? arr.map(String).filter((s) => STEP_NAMES.includes(s)).slice(0, 6) : []);
  return { passed: l?.passed === true, steps: pick(l?.steps), failed: pick(l?.failed), fallback_selfie: l?.fallback_selfie === true };
}

// Decide o envio. Prova de vida reprovada ou rosto não conferido só seguem pela conferência manual do escritório,
// e só depois de 2 falhas registradas no servidor.
export function decideSubmit({ liveness, distRaw, manualRequested, attempts, faceLimit }) {
  const lv = sanitizeLiveness(liveness);
  const faceOk = Number.isFinite(distRaw) && distRaw <= faceLimit;
  const manual = !faceOk || !lv.passed;
  if (manual && !(manualRequested && reviewAllowed(attempts))) {
    return { ok: false, error: lv.passed ? 'O reconhecimento facial não confirmou sua identidade.' : 'A prova de vida não foi concluída. Tente de novo ou envie para o escritório conferir.' };
  }
  return { ok: true, manual, liveness: lv };
}

// Linha do relatório: transparência sobre cada etapa concluída ou não.
export function livenessReportText(lv) {
  const done = (lv?.steps || []).join(', ');
  if (lv?.passed) return `Aprovada – desafios cumpridos: ${done}`;
  const failed = (lv?.failed || []).join(', ');
  return `Não concluída automaticamente – etapas cumpridas: ${done || 'nenhuma'}; etapas não cumpridas: ${failed || 'não informado'}${lv?.fallback_selfie ? '; selfie de reserva (último quadro com rosto detectado)' : ''}`;
}
