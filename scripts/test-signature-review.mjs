import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextAttempts, reviewAllowed, cleanKind, sanitizeLiveness, decideSubmit, livenessReportText } from '../supabase/functions/signature-biometric-public/_shared/review-policy.mjs';
const LIM = 0.55, full = { passed: true, steps: ['piscar os olhos', 'virar o rosto', 'olhar de frente'] };
// 1) toda falha conta; 2 liberam conferência
assert.equal(nextAttempts(0), 1); assert.equal(nextAttempts(null), 1);
assert.ok(!reviewAllowed(1)); assert.ok(reviewAllowed(2)); assert.ok(reviewAllowed(5));
assert.equal(cleanKind('liveness'), 'liveness'); assert.equal(cleanKind('eyes'), 'eyes'); assert.equal(cleanKind('x'), 'face');
// fluxo normal inalterado
assert.deepEqual(decideSubmit({ liveness: full, distRaw: 0.4, manualRequested: false, attempts: 0, faceLimit: LIM }).manual, false);
// rosto fora do limite: precisa de 2 falhas + pedido manual (regra anterior mantida)
assert.ok(!decideSubmit({ liveness: full, distRaw: 0.7, manualRequested: true, attempts: 1, faceLimit: LIM }).ok);
assert.ok(!decideSubmit({ liveness: full, distRaw: 0.7, manualRequested: false, attempts: 3, faceLimit: LIM }).ok);
assert.ok(decideSubmit({ liveness: full, distRaw: 0.7, manualRequested: true, attempts: 2, faceLimit: LIM }).manual);
// prova de vida falhou (selfie de reserva, sem distância): só pela conferência manual, após 2 falhas
const lvFail = { passed: false, steps: ['olhar de frente'], failed: ['piscar os olhos', 'virar o rosto'], fallback_selfie: true };
assert.ok(!decideSubmit({ liveness: lvFail, distRaw: NaN, manualRequested: true, attempts: 1, faceLimit: LIM }).ok);
assert.ok(!decideSubmit({ liveness: lvFail, distRaw: NaN, manualRequested: false, attempts: 4, faceLimit: LIM }).ok);
assert.ok(!decideSubmit({ liveness: lvFail, distRaw: 0.3, manualRequested: false, attempts: 4, faceLimit: LIM }).ok, 'rosto bom NÃO dispensa conferência se a prova de vida falhou');
const okMan = decideSubmit({ liveness: lvFail, distRaw: NaN, manualRequested: true, attempts: 2, faceLimit: LIM });
assert.ok(okMan.ok && okMan.manual && okMan.liveness.passed === false);
// cliente não consegue forjar passed nem inserir texto livre
assert.equal(sanitizeLiveness({ passed: 'true', steps: ['<script>', 'virar o rosto'] }).passed, false);
assert.deepEqual(sanitizeLiveness({ passed: true, steps: ['<script>', 'virar o rosto'] }).steps, ['virar o rosto']);
assert.equal(sanitizeLiveness(undefined).passed, false);
// relatório transparente
assert.match(livenessReportText(full), /^Aprovada/);
const t = livenessReportText(okMan.liveness);
assert.match(t, /etapas cumpridas: olhar de frente/); assert.match(t, /não cumpridas: piscar os olhos, virar o rosto/); assert.match(t, /selfie de reserva/);
// código: linhas de hash e carimbo continuam no relatório e na finalização
const fn = readFileSync('supabase/functions/signature-biometric-public/index.ts', 'utf8');
for (const k of ['SHA-256 do original', 'rowKV("Carimbo do tempo"', 'signed_sha256', 'timestamp_pdf', 'verification_code', 'conferidos visualmente e aprovados por']) assert.ok(fn.includes(k), 'faltou: ' + k);
assert.ok(/face_fail[\s\S]{0,400}nextAttempts/.test(fn)); assert.ok(!fn.includes('A prova de vida não foi concluída." }, 400'));
// tela: falhas registradas, selfie de reserva e tolerância
const ui = readFileSync('src/pages/AssinarPublico.tsx', 'utf8');
for (const k of ["failLiveness('liveness'", "failLiveness('eyes'", 'registerFaceFail(kind)', "kind })", 'fallback_selfie: fallbackSelfie', 'Math.max(0.10, baseline() * 0.6)', 'Enviar para o escritório conferir']) assert.ok(ui.includes(k), 'faltou na tela: ' + k);
console.log('signature-review: ok');
