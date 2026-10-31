import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { METHODS, buildChargePlan, groupCharges, describeCharge, checkoutPayload } from './_shared/infinitepay-core.mjs'

const allowedOrigins = new Set(['https://lexoffice-ashy.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'])
const cors = (req: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigins.has(req.headers.get('origin') || '') ? req.headers.get('origin')! : 'https://lexoffice-ashy.vercel.app',
  'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
})
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const INFINITEPAY_LINKS = 'https://api.checkout.infinitepay.io/links'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'Método não permitido.' }, 405)
  const origin = req.headers.get('origin') || ''
  if (origin && !allowedOrigins.has(origin)) return json(req, { error: 'Origem não permitida.' }, 403)
  try {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return json(req, { error: 'Configuração interna indisponível.' }, 503)
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: u } = await admin.auth.getUser(token)
    const user = u?.user
    if (!user) return json(req, { error: 'Sessão inválida. Entre novamente.' }, 401)
    const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single()
    const org = profile?.org_id
    if (!org) return json(req, { error: 'Escritório não identificado.' }, 403)
    const body = await req.json().catch(() => ({}))

    // ---- Cancelar ----
    if (body.action === 'cancel') {
      const { data: ch } = await admin.from('infinitepay_charges').select('id,status,org_id,owner_user_id').eq('id', String(body.charge_id || '')).eq('org_id', org).eq('owner_user_id', user.id).maybeSingle()
      if (!ch) return json(req, { error: 'Cobrança não encontrada.' }, 404)
      if (!['homologation', 'active'].includes(ch.status)) return json(req, { error: 'Só cobranças em aberto podem ser canceladas.' }, 409)
      const { error: e1 } = await admin.from('infinitepay_charges').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', ch.id).in('status', ['homologation', 'active'])
      if (e1) return json(req, { error: 'Não foi possível cancelar.' }, 500)
      await admin.from('infinitepay_charge_items').update({ active: false }).eq('charge_id', ch.id)
      return json(req, { ok: true })
    }

    // ---- Criar ----
    const method = String(body.method || '')
    if (!METHODS.includes(method)) return json(req, { error: 'Forma de pagamento inválida.' }, 400)
    const clientId = String(body.client_id || ''), contractId = String(body.contract_id || '')
    const instIds: string[] = Array.isArray(body.installment_ids) ? body.installment_ids.map(String) : []
    if (!clientId || !contractId || !instIds.length || instIds.length > 60) return json(req, { error: 'Informe cliente, contrato e parcelas.' }, 400)

    const { data: contract } = await admin.from('fee_contracts').select('id,client_id,owner_user_id').eq('id', contractId).eq('org_id', org).eq('client_id', clientId).maybeSingle()
    if (!contract || contract.owner_user_id !== user.id) return json(req, { error: 'Contrato não encontrado.' }, 404)
    const { data: installments } = await admin.from('fee_installments').select('id,client_id,contract_id,installment_number,due_date,status,owner_user_id').eq('org_id', org).eq('contract_id', contractId).in('id', instIds)
    const { data: entries } = await admin.from('financial_entries').select('id,installment_id,type,amount').eq('org_id', org).in('installment_id', instIds)
    const entryIds = (entries || []).map((e: any) => e.id)
    const { data: payments } = entryIds.length ? await admin.from('financial_entry_payments').select('financial_entry_id,amount').in('financial_entry_id', entryIds) : { data: [] as any[] }
    const { data: open } = entryIds.length ? await admin.from('infinitepay_charge_items').select('financial_entry_id, infinitepay_charges!inner(status)').in('financial_entry_id', entryIds).eq('active', true).in('infinitepay_charges.status', ['homologation', 'active']) : { data: [] as any[] }

    const plan = buildChargePlan({ installmentIds: instIds, installments: installments || [], entries: entries || [], payments: payments || [], blockedEntryIds: (open || []).map((o: any) => o.financial_entry_id), clientId, contractId, userId: user.id })
    if (!plan.ok) return json(req, { error: plan.error }, 422)
    // O total enviado pela tela é só conferência: vale o calculado no banco.
    if (body.expected_total_cents != null && Number(body.expected_total_cents) !== plan.totalCents) return json(req, { error: 'Os valores mudaram. Revise a conferência e tente novamente.', total_cents: plan.totalCents }, 409)

    const { data: settings } = await admin.from('infinitepay_settings').select('handle,live_enabled').eq('org_id', org).maybeSingle()
    const live = !!(settings?.live_enabled && settings?.handle)
    const environment = live ? 'production' : 'homologation'
    const batchId = crypto.randomUUID()
    const created: any[] = []

    for (const g of groupCharges(method, plan.items)) {
      const orderNsu = crypto.randomUUID(), webhookToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
      const description = describeCharge(g.items)
      const webhookUrl = `${url}/functions/v1/infinitepay-webhook?token=${webhookToken}`
      const payload = live ? checkoutPayload({ handle: settings!.handle, orderNsu, description, amountCents: g.amountCents, redirectUrl: Deno.env.get('PUBLIC_APP_URL') || 'https://lexoffice-ashy.vercel.app/financeiro', webhookUrl }) : { homologation: true, order_nsu: orderNsu, amount_cents: g.amountCents, description }
      let status = live ? 'active' : 'homologation', checkoutUrl: string | null = null, providerResponse: unknown = null, lastError: string | null = null
      if (live) {
        // Única chamada externa — só ocorre com live_enabled liberado em infinitepay_settings.
        const r = await fetch(INFINITEPAY_LINKS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        providerResponse = await r.json().catch(() => null)
        checkoutUrl = (providerResponse as any)?.url || (providerResponse as any)?.checkout_url || null
        if (!r.ok || !checkoutUrl) { status = 'failed'; lastError = `InfinitePay respondeu ${r.status}` }
      }
      const { data: row, error } = await admin.from('infinitepay_charges').insert({
        org_id: org, owner_user_id: user.id, created_by: user.id, client_id: clientId, contract_id: contractId, batch_id: batchId, method, environment,
        order_nsu: orderNsu, webhook_token: webhookToken, amount_cents: g.amountCents, description, due_date: g.dueDate, status, checkout_url: checkoutUrl,
        request_payload: payload, provider_response: providerResponse, last_error: lastError,
      }).select('id,status,amount_cents,checkout_url').single()
      if (error || !row) return json(req, { error: 'Não foi possível registrar a cobrança.', created }, 500)
      await admin.from('infinitepay_charge_items').insert(g.items.map((i: any) => ({ charge_id: row.id, org_id: org, owner_user_id: user.id, financial_entry_id: i.entryId, amount_cents: i.amountCents, active: status !== 'failed' })))
      created.push(row)
    }
    return json(req, { ok: true, environment, batch_id: batchId, charges: created })
  } catch (e) { console.error(e); return json(req, { error: 'Erro interno ao criar a cobrança.' }, 500) }
})
