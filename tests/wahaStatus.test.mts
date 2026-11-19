// node --experimental-strip-types tests/wahaStatus.test.mts
import {mapWahaStatus, normalizeWahaUrl, pickEngine, pickWahaSession} from '../supabase/functions/whatsapp-waha-status/state.ts';
let ok = 0, bad = 0;
const t = (name: string, cond: boolean, got?: unknown) => { if (cond) { ok++; console.log('PASSOU', name); } else { bad++; console.log('FALHOU', name, JSON.stringify(got)); } };

// Estados do WAHA
t('WORKING -> connected', mapWahaStatus('WORKING') === 'connected');
t('working minúsculo -> connected', mapWahaStatus(' working ') === 'connected');
t('STARTING -> connecting', mapWahaStatus('STARTING') === 'connecting');
t('SCAN_QR_CODE -> qr_pending', mapWahaStatus('SCAN_QR_CODE') === 'qr_pending');
t('STOPPED -> disconnected', mapWahaStatus('STOPPED') === 'disconnected');
t('FAILED -> disconnected', mapWahaStatus('FAILED') === 'disconnected');
// Negativos / limite
t('undefined -> unknown', mapWahaStatus(undefined) === 'unknown');
t('null -> unknown', mapWahaStatus(null) === 'unknown');
t('vazio -> unknown', mapWahaStatus('') === 'unknown');
t('valor inesperado -> unknown (nunca "connected")', mapWahaStatus('QUALQUER_COISA') === 'unknown');
t('objeto -> unknown', mapWahaStatus({status: 'WORKING'}) === 'unknown');

// URL
t('https válido', normalizeWahaUrl('https://lexoffice-waha-production.up.railway.app') === 'https://lexoffice-waha-production.up.railway.app');
t('remove barra final', normalizeWahaUrl('https://x.example.com/') === 'https://x.example.com');
t('http recusado', normalizeWahaUrl('http://x.example.com') === null);
t('usuário/senha recusado', normalizeWahaUrl('https://a:b@x.example.com') === null);
t('query recusada', normalizeWahaUrl('https://x.example.com/?k=1') === null);
t('fragmento recusado', normalizeWahaUrl('https://x.example.com/#a') === null);
t('texto solto recusado', normalizeWahaUrl('isso não é url') === null);
t('vazio recusado', normalizeWahaUrl('') === null);

// Sessão
const conn = {status: 'connected', settings: {waha_session: 'lexoffice'}};
const disc = {status: 'disconnected', settings: {waha_session: 'antiga'}};
t('prefere registro connected', pickWahaSession([disc, conn]) === 'lexoffice');
t('sem connected usa o primeiro válido', pickWahaSession([disc]) === 'antiga');
t('lista vazia -> null', pickWahaSession([]) === null);
t('sessão em branco ignorada', pickWahaSession([{status: 'connected', settings: {waha_session: '  '}}]) === null);
t('settings nulo ignorado', pickWahaSession([{status: 'connected', settings: null}]) === null);
t('sessão não-texto ignorada', pickWahaSession([{status: 'connected', settings: {waha_session: 123 as unknown as string}}]) === null);
t('aparas na sessão', pickWahaSession([{status: 'connected', settings: {waha_session: ' lexoffice '}}]) === 'lexoffice');

// Motor
t('engine objeto GOWS', pickEngine({engine: {engine: 'GOWS'}}) === 'GOWS');
t('engine texto minúsculo', pickEngine({engine: ' noweb '}) === 'NOWEB');
t('engine WEBJS', pickEngine({engine: {engine: 'WEBJS'}}) === 'WEBJS');
t('engine desconhecido -> null', pickEngine({engine: {engine: 'OUTRO'}}) === null);
t('sem engine -> null', pickEngine({}) === null);
t('null -> null', pickEngine(null) === null);
t('undefined -> null', pickEngine(undefined) === null);
t('engine número -> null', pickEngine({engine: 5}) === null);

console.log(`\n${ok} passaram, ${bad} falharam`);
if (bad) process.exit(1);
