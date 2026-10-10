import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAssets, assertToken, selectPhone } from "./validation.ts";
const GV = 'v21.0';
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const html = (b: string, s = 200) => new Response(b, { status: s, headers: { "Content-Type": "text/html; charset=utf-8" } });
async function appConfig(admin: any, orgId: string) { const envId = (Deno.env.get('META_APP_ID') || '').trim(), envSecret = (Deno.env.get('META_APP_SECRET') || '').trim(), envCfg = (Deno.env.get('META_EMBEDDED_CONFIG_ID') || '').trim(); const { data: runtime } = await admin.from('system_runtime_secrets').select('key,secret').in('key', ['meta_app_id', 'meta_app_secret', 'meta_embedded_config_id']); const map = Object.fromEntries((runtime || []).map((x: any) => [x.key, x.secret])); if (map.meta_app_id && map.meta_app_secret)
    return { appId: String(map.meta_app_id), appSecret: String(map.meta_app_secret), configurationId: String(map.meta_embedded_config_id || envCfg || ''), source: 'runtime' }; if (envId && envSecret)
    return { appId: envId, appSecret: envSecret, configurationId: envCfg || String(map.meta_embedded_config_id || ''), source: 'env' }; const { data } = await admin.rpc('read_integration_secret', { p_org_id: orgId, p_provider: 'meta_oauth_app' }); if (!data)
    return { appId: '', appSecret: '', configurationId: '', source: 'none' }; try {
    const d = JSON.parse(String(data));
    return { appId: String(d?.app_id || ''), appSecret: String(d?.app_secret || ''), configurationId: String(d?.configuration_id || ''), source: 'vault' };
}
catch {
    return { appId: '', appSecret: '', configurationId: '', source: 'none' };
} }
async function graph(path: string, access: string) { const response = await fetch(`https://graph.facebook.com/${GV}/${path}`, { headers: { Authorization: `Bearer ${access}` } }); const data = await response.json().catch(() => null); if (!response.ok || data?.error)
    throw new Error('A Meta recusou a validação do ativo. Confira as permissões e os ativos autorizados.'); return data; }
async function discover(access: string, cfg: any, body: any) {
    const { wabaId, phoneId } = requireAssets(body);
    const debug = await graph(`debug_token?input_token=${encodeURIComponent(access)}`, `${cfg.appId}|${cfg.appSecret}`);
    assertToken(debug?.data, cfg.appId, wabaId);
    const waba = await graph(`${wabaId}?fields=id,name`, access);
    if (String(waba?.id) !== wabaId)
        throw new Error('WABA não validada.');
    const pd = await graph(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&limit=100`, access);
    let phones = pd?.data || [], after = pd?.paging?.cursors?.after;
    for (let page = 0; !phones.some((x: any) => String(x.id) === phoneId) && pd?.paging?.next && after && page < 20; page++) {
        const next = await graph(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&limit=100&after=${encodeURIComponent(after)}`, access);
        phones = phones.concat(next.data || []);
        after = next?.paging?.next ? next?.paging?.cursors?.after : null;
    }
    const phone = selectPhone(phones, phoneId);
    const me = await graph('me?fields=id,name', access);
    // Do not infer ownership from the first business visible to this token.
    return { me, business: null, waba, phone };
}
async function persist(admin: any, orgId: string, access: string, meta: any, mode: string, ownerUserId?: string | null) { const { me, business, waba, phone } = meta; if (!ownerUserId)
    throw new Error('Proprietário da conexão ausente.'); const { data: route, error: routeError } = await admin.from('whatsapp_connections').select('owner_user_id').eq('org_id', orgId).eq('provider_type', 'meta_cloud').maybeSingle(); if (routeError || route && route.owner_user_id !== ownerUserId)
    throw new Error('A rota pertence a outro usuário; revisão administrativa necessária.'); if (!waba?.id || !phone?.id)
    throw new Error('Ativos do WhatsApp não validados.'); const { error: secretError } = await admin.rpc('store_integration_secret', { p_org_id: orgId, p_provider: 'meta_whatsapp', p_secret_value: access, p_account_email: null }); if (secretError)
    throw new Error('Falha ao guardar autorização.'); const { data: existing } = await admin.from('integration_connections').select('id,settings').eq('org_id', orgId).eq('owner_user_id', ownerUserId).eq('provider', 'meta_whatsapp').maybeSingle(); const payload: any = { org_id: orgId, owner_user_id: ownerUserId, provider: 'meta_whatsapp', display_name: 'Meta / WhatsApp Oficial', status: 'connecting', external_account_id: business?.id || me?.id || null, last_error: null, last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString(), settings: { ...(existing?.settings || {}), connection_mode: mode, oauth_state: null, meta_user_id: me?.id || null, meta_user_name: me?.name || null, business_id: business?.id || null, business_name: business?.name || null, waba_id: waba?.id || null, waba_name: waba?.name || null, phone_number_id: phone?.id || null, display_phone_number: phone?.display_phone_number || null, verified_name: phone?.verified_name || null, quality_rating: phone?.quality_rating || null } }; const saved = existing?.id ? await admin.from('integration_connections').update(payload).eq('id', existing.id).eq('org_id', orgId).eq('owner_user_id', ownerUserId) : await admin.from('integration_connections').insert(payload); if (saved.error)
    throw new Error('Falha ao guardar conexão.'); let owner = ownerUserId || null; if (!owner) {
    const { data: prof } = await admin.from('profiles').select('id').eq('org_id', orgId).limit(1).maybeSingle();
    owner = prof?.id || null;
} if (owner) {
    const { error: wcErr } = await admin.from('whatsapp_connections').upsert({ org_id: orgId, provider_type: 'meta_cloud', provider_name: 'meta', display_name: 'WhatsApp Oficial', status: 'connected', meta_business_id: business?.id || null, meta_waba_id: waba?.id || null, meta_phone_number_id: phone?.id || null, display_phone_number: phone?.display_phone_number || null, verified_name: phone?.verified_name || null, last_connected_at: new Date().toISOString(), last_sync_at: new Date().toISOString(), last_error: null, is_active: true, owner_user_id: owner, settings: { quality_rating: phone?.quality_rating || null, connection_mode: mode } }, { onConflict: 'org_id,provider_type' });
    if (wcErr)
        throw new Error('Falha ao guardar rota do WhatsApp.');
    const { error: finalError } = await admin.from('integration_connections').update({ status: 'connected' }).eq('org_id', orgId).eq('owner_user_id', ownerUserId).eq('provider', 'meta_whatsapp');
    if (finalError)
        throw new Error('Falha ao confirmar conexão.');
}
else {
    throw new Error('Proprietário da conexão ausente.');
} }
Deno.serve(async (req) => { if (req.method === 'OPTIONS')
    return new Response('ok', { headers: cors }); try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, redirect = Deno.env.get('META_REDIRECT_URI') || `${url}/functions/v1/meta-whatsapp-oauth`, frontend = Deno.env.get('META_FRONTEND_URL') || 'https://lex.suzannefigueiredoadvocacia.com.br/integracoes';
    const admin = createClient(url, service, { auth: { persistSession: false } }), u = new URL(req.url);
    if (req.method === 'GET' && u.searchParams.get('debugredirect')) {
        return json({ redirect, env_override: Boolean(Deno.env.get('META_REDIRECT_URI')), supabase_url: url });
    }
    if (req.method === 'GET' && u.searchParams.get('code')) {
        return html('<h2>LEXOFFICE</h2><p>Use o cadastro Embedded Signup para validar a conta e o número do WhatsApp.</p>', 409);
    }
    if (req.method !== 'POST')
        return json({ error: 'Método não permitido' }, 405);
    const auth = req.headers.get('Authorization') || '', userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user)
        return json({ error: 'Sessão inválida' }, 401);
    const { data: p } = await admin.from('profiles').select('org_id,role_key,status').eq('id', user.id).maybeSingle();
    if (!p?.org_id || p.status !== 'active')
        return json({ error: 'Organização não encontrada' }, 403);
    const body = await req.json().catch(() => ({})), action = String(body.action || 'status');
    if (action === 'configure_app') {
        const { data: platformAdmin } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).eq('status', 'active').maybeSingle();
        if (!platformAdmin)
            return json({ error: 'Configuração global restrita à administração da plataforma.' }, 403);
        const appId = String(body.app_id || '').trim(), appSecret = String(body.app_secret || '').trim(), configurationId = String(body.configuration_id || '').trim();
        if (!/^\d+$/.test(appId) || !appSecret || !/^\d+$/.test(configurationId))
            return json({ error: 'Informe o App ID e o App Secret da Meta.' }, 400);
        const now = new Date().toISOString();
        for (const [key, secret] of [['meta_app_id', appId], ['meta_app_secret', appSecret], ['meta_embedded_config_id', configurationId]]) {
            if (!secret && key === 'meta_embedded_config_id')
                continue;
            const { error } = await admin.from('system_runtime_secrets').upsert({ key, secret, updated_at: now }, { onConflict: 'key' });
            if (error)
                throw error;
        }
        return json({ ok: true, configured: true, embedded_ready: Boolean(configurationId) });
    }
    if (action === 'status') {
        const cfg = await appConfig(admin, p.org_id);
        const { data: c } = await admin.from('integration_connections').select('status,external_account_id,last_error,settings,last_sync_at').eq('org_id', p.org_id).eq('owner_user_id', user.id).eq('provider', 'meta_whatsapp').maybeSingle();
        return json({ ok: true, configured: Boolean(cfg.appId && cfg.appSecret), app_id: cfg.appId || null, embedded_configuration_id: cfg.configurationId || null, embedded_ready: Boolean(cfg.appId && cfg.appSecret && cfg.configurationId), credential_source: cfg.source, connection: c || null, redirect_uri: redirect });
    }
    if (action === 'start')
        return json({ error: 'Use Embedded Signup para selecionar e validar explicitamente a WABA e o número.' }, 409);
    if (action === 'embedded_exchange') {
        requireAssets(body);
        if (p.role_key !== 'owner')
            return json({ error: 'Conexão restrita ao proprietário ativo da organização.' }, 403);
        const cfg = await appConfig(admin, p.org_id), code = String(body.code || '').trim();
        if (!cfg.appId || !cfg.appSecret || !cfg.configurationId)
            return json({ error: 'Configure App ID, App Secret e ID da configuração do Embedded Signup.' }, 400);
        if (!code)
            return json({ error: 'Código do Embedded Signup ausente.' }, 400);
        const tr = await fetch(`https://graph.facebook.com/${GV}/oauth/access_token`, { method: 'POST', body: new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, code }) }), td = await tr.json().catch(() => null);
        if (!tr.ok || !td?.access_token)
            return json({ error: 'Falha ao trocar o código do Embedded Signup.', provider_status: tr.status }, 502);
        await persist(admin, p.org_id, td.access_token, await discover(td.access_token, cfg, body), 'embedded_signup', user.id);
        return json({ ok: true, connected: true });
    }
    return json({ error: 'Ação inválida' }, 400);
}
catch (e) {
    console.error('meta_oauth_request_failed');
    return json({ error: 'A conexão não pôde ser validada. Confira os ativos e permissões da Meta.' }, 502);
} });
