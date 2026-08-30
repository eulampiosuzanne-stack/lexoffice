import { createClient } from '@supabase/supabase-js';
import { AdapterFactory } from './automation/AdapterFactory.js';
import type { Credentials } from './automation/BaseAdapter.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WORKER_ID = process.env.WORKER_ID || `tribunal-worker-${process.pid}`;
const POLL_MS = Math.max(5_000, Number(process.env.POLL_MS || 15_000));
const MAX_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.MAX_CONCURRENCY || 2)));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const slug = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

async function credentialsFor(connection: any): Promise<Credentials> {
  const provider = `tribunal_credentials_${String(connection.tribunal_code).toLowerCase()}_${slug(String(connection.judicial_system || ''))}_${String(connection.user_id).replace(/-/g, '')}`;
  const { data, error } = await supabase.rpc('read_integration_secret', {
    p_org_id: connection.org_id,
    p_provider: provider,
  });
  if (error || !data) throw new Error('COURT_CREDENTIALS_NOT_FOUND');
  const secret = JSON.parse(String(data));
  if (!secret.login || !secret.password) throw new Error('COURT_CREDENTIALS_INCOMPLETE');
  return {
    username: String(secret.login),
    password: String(secret.password),
    twoFactorSeed: secret.two_factor_seed ? String(secret.two_factor_seed) : undefined,
  };
}

async function intervention(job: any, connection: any, kind: string, message: string) {
  await supabase.from('tribunal_worker_interventions').insert({
    org_id: job.org_id,
    connection_id: connection.id,
    tribunal_code: connection.tribunal_code,
    judicial_system: connection.judicial_system,
    job_id: job.id,
    kind,
    status: 'open',
    title: kind === 'captcha' ? 'Tribunal exige intervenção humana' : 'Configuração do tribunal precisa de atenção',
    message,
    action_url: job.search_payload?.base_url || null,
    metadata: { worker_id: WORKER_ID, attempts: job.attempts },
  });
}

async function processOne(): Promise<boolean> {
  const { data: job, error: claimError } = await supabase.rpc('claim_tribunal_sync_job', { p_worker_id: WORKER_ID });
  if (claimError) throw claimError;
  if (!job?.id) return false;

  let adapter: any = null;
  let credentials: Credentials | null = null;
  try {
    const { data: connection, error } = await supabase
      .from('tribunal_connections')
      .select('*')
      .eq('id', job.connection_id)
      .single();
    if (error || !connection) throw new Error('COURT_CONNECTION_NOT_FOUND');

    credentials = await credentialsFor(connection);
    const baseUrl = String(job.search_payload?.base_url || '').trim();
    adapter = AdapterFactory.getAdapter(connection.judicial_system || '', baseUrl);
    await adapter.login(credentials);
    const processes = await adapter.fetchProcesses(job.search_payload || {});

    await supabase.rpc('complete_tribunal_sync_job', {
      p_job_id: job.id,
      p_result: { count: processes.length, processes },
    });
    await supabase.from('tribunal_connections').update({
      status: 'connected',
      last_authenticated_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', connection.id);
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const needsIntervention = ['CAPTCHA_BLOCKING','TOTP_SEED_REQUIRED','LOGIN_LAYOUT_NOT_RECOGNIZED','COURT_BASE_URL_REQUIRED','PJE_QUERY_URL_NOT_CONFIGURED','EPROC_QUERY_URL_NOT_CONFIGURED'].some(x => message.includes(x));
    if (needsIntervention) {
      const { data: connection } = await supabase.from('tribunal_connections').select('*').eq('id', job.connection_id).maybeSingle();
      if (connection) await intervention(job, connection, message.includes('CAPTCHA') ? 'captcha' : 'configuration', message);
    }
    await supabase.rpc('fail_tribunal_sync_job', {
      p_job_id: job.id,
      p_error: message,
      p_needs_intervention: needsIntervention,
    });
    return true;
  } finally {
    credentials = null;
    await adapter?.close?.().catch(() => undefined);
  }
}

async function cycle() {
  await Promise.all(Array.from({ length: MAX_CONCURRENCY }, () => processOne().catch(err => console.error('[worker]', err))));
}

console.log(`[LEXOFFICE] Tribunal worker iniciado: ${WORKER_ID}; concorrência=${MAX_CONCURRENCY}`);
await cycle();
setInterval(() => void cycle(), POLL_MS);
