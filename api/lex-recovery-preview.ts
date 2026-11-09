import { Pool } from 'pg';
import type { IncomingMessage, ServerResponse } from 'node:http';

const authUrl = 'https://dcpwcuototomxoiszukt.supabase.co/auth/v1/user';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const queries = {
  clients: 'SELECT id, name, status, created_at FROM lex_recovery_preview.clients ORDER BY name, id',
  processes: 'SELECT id, client_id, cnj_number, internal_number, subject, status, updated_at FROM lex_recovery_preview.processes ORDER BY updated_at DESC, id',
  agenda: 'SELECT id, client_id, process_id, title, event_type, starts_at, ends_at, status FROM lex_recovery_preview.calendar_events ORDER BY starts_at DESC, id',
  finance: 'SELECT id, client_id, process_id, type, description, amount, due_date, paid_at, status FROM lex_recovery_preview.financial_entries ORDER BY created_at DESC, id',
} as const;

let pool: Pool | undefined;

function respond(res: ServerResponse, status: number, body: object) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'migration/neon-lexoffice') {
    return respond(res, 404, { error: 'Rota indisponível.' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return respond(res, 405, { error: 'Método não permitido.' });
  }

  const authorization = req.headers.authorization;
  if (!authorization || !/^Bearer [\w.-]+$/i.test(authorization)) {
    return respond(res, 401, { error: 'Entre na LexOffice para consultar os dados.' });
  }

  const params = new URL(req.url || '/', 'http://localhost').searchParams;
  const resource = params.get('resource') || '';
  const limit = Number(params.get('limit') ?? 50);
  const offset = Number(params.get('offset') ?? 0);
  if (!Object.hasOwn(queries, resource) || !Number.isInteger(limit) || limit < 1 || limit > 100
      || !Number.isInteger(offset) || offset < 0 || offset > 10_000) {
    return respond(res, 400, { error: 'Consulta ou paginação inválida.' });
  }

  const authKey = process.env.VITE_SUPABASE_ANON_KEY;
  const connectionString = process.env.LEX_CONTINGENCY_DATABASE_URL;
  if (!authKey || !connectionString) {
    return respond(res, 503, { error: 'Homologação indisponível.' });
  }

  try {
    const identity = await fetch(authUrl, {
      headers: { authorization, apikey: authKey },
      signal: AbortSignal.timeout(5000),
    });
    if ([400, 401, 403].includes(identity.status)) {
      return respond(res, 401, { error: 'Sessão inválida ou expirada.' });
    }
    if (!identity.ok) {
      return respond(res, 503, { error: 'O serviço de autenticação está indisponível.' });
    }
    const user = await identity.json() as { id?: string; role?: string; is_anonymous?: boolean };
    if (!user.id || !uuid.test(user.id) || user.role !== 'authenticated' || user.is_anonymous) {
      return respond(res, 401, { error: 'Sessão inválida.' });
    }

    pool ??= new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
    const db = await pool.connect();
    let discardConnection = false;
    try {
      await db.query('BEGIN READ ONLY');
      const login = await db.query('SELECT session_user AS login');
      if (login.rows[0]?.login !== 'lex_recovery_preview_login') {
        throw new Error('Unexpected database login');
      }
      await db.query('SET LOCAL ROLE lex_recovery_preview_reader');
      await db.query("SET LOCAL statement_timeout = '5s'");
      await db.query("SELECT set_config('lex_recovery.user_id', $1, true)", [user.id]);
      const profile = await db.query(
        "SELECT org_id FROM lex_recovery_preview.profiles WHERE id = $1 AND status = 'active' AND role_key IN ('owner', 'admin')",
        [user.id],
      );
      const orgId = profile.rows[0]?.org_id;
      if (!orgId) {
        await db.query('ROLLBACK');
        return respond(res, 403, { error: 'Seu perfil não tem acesso à homologação.' });
      }

      await db.query("SELECT set_config('lex_recovery.org_id', $1, true)", [orgId]);
      const query = queries[resource as keyof typeof queries];
      const result = await db.query(query + ' LIMIT $1 OFFSET $2', [limit + 1, offset]);
      await db.query('COMMIT');
      return respond(res, 200, { rows: result.rows.slice(0, limit), hasMore: result.rows.length > limit });
    } catch (error) {
      try { await db.query('ROLLBACK'); } catch { discardConnection = true; }
      throw error;
    } finally {
      db.release(discardConnection);
    }
  } catch {
    return respond(res, 503, { error: 'Consulta temporariamente indisponível.' });
  }
}
