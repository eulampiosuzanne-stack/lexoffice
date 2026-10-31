// InfinitePay — uma única função (o plano do Supabase está no limite de funções):
//  • aviso de pagamento (POST da InfinitePay, ?token=...)  → confirma em payment_check e dá baixa;
//  • action "create" / "cancel" (POST do painel, com a sessão da usuária) → cria/cancela cobrança.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { METHODS, buildChargePlan, groupCharges, describeCharge, checkoutPayload, extractCheckoutUrl, paymentConfirmed, webhookGate } from './_shared/infinitepay-core.mjs'

const PAYMENT_CHECK = 'https://api.checkout.infinitepay.io/payment_check'
const INFINITEPAY_LINKS = 'https://api.checkout.infinitepay.io/links'
const allowedOrigins = new Set(['https://lexoffice-ashy.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'])
const cors = (req: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigins.has(req.headers.get('origin') || '') ? req.headers.get('origin')! : 'https://lexoffice-ashy.vercel.app',
  'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
})
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const ok = (result: string) => new Response(JSON.stringify({ result }), { status: 200, headers: { 'Content-Type': 'application/json' } })

// ---------------- Painel: criar e cancelar ----------------
async function panel(req: Request, admin: any, body: any, url: string) {
  const origin = req.headers.get('origin') || ''
  if (origin && !allowedOrigins.has(origin)) return json(req, { error: 'Origem não permitida.' }, 403)
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: u } = await admin.auth.getUser(token)
  const user = u?.user
  if (!user) return json(req, { error: 'Sessão inválida. Entre novamente.' }, 401)
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single()
  const org = profile?.org_id
  if (!org) return json(req, { error: 'Escritório não identificado.' }, 403)

  if (body.action === 'cancel') {
    const { data: ch } = await admin.from('infinitepay_charges').select('id,status').eq('id', String(body.charge_id || '')).eq('org_id', org).eq('owner_user_id', user.id).maybeSingle()
    if (!ch) return json(req, { error: 'Cobrança não encontrada.' }, 404)
    if (!['homologation', 'active'].includes(ch.status)) return json(req, { error: 'Só cobranças em aberto podem ser canceladas.' }, 409)
    const now = new Date().toISOString()
    const { error } = await admin.from('infinitepay_charges').update({ status: 'cancelled', cancelled_at: now, updated_at: now }).eq('id', ch.id).in('status', ['homologation', 'active'])
    if (error) return json(req, { error: 'Não foi possível cancelar.' }, 500)
    await admin.from('infinitepay_charge_items').update({ active: false }).eq('charge_id', ch.id)
    // A InfinitePay não cancela links pela API: o link continua existindo lá, mas o webhook ignora cobrança cancelada.
    return json(req, { ok: true, note: 'cancelado_no_sistema' })
  }

  const method = String(body.method || '')
  if (!METHODS.includes(method)) return json(req, { error: 'Forma de pagamento inválida.' }, 400)
  const clientId = String(body.client_id || ''), contractId = String(body.contract_id || '')
  const entryIds: string[] = Array.isArray(body.entry_ids) ? body.entry_ids.map(String) : []
  if (!clientId || !contractId || !entryIds.length || entryIds.length > 60) return json(req, { error: 'Informe cliente, contrato e parcelas.' }, 400)

  const { data: contract } = await admin.from('fee_contracts').select('id,owner_user_id').eq('id', contractId).eq('org_id', org).eq('client_id', clientId).maybeSingle()
  if (!contract || contract.owner_user_id !== user.id) return json(req, { error: 'Contrato não encontrado.' }, 404)
  const { data: entries } = await admin.from('financial_entries').select('id,client_id,contract_id,owner_user_id,type,description,amount,due_date,status').eq('org_id', org).eq('contract_id', contractId).in('id', entryIds)
  const found = (entries || []).map((e: any) => e.id)
  const { data: payments } = found.length ? await admin.from('financial_entry_payments').select('financial_entry_id,amount').in('financial_entry_id', found) : { data: [] as any[] }
  const { data: open } = found.length ? await admin.from('infinitepay_charge_items').select('financial_entry_id, infinitepay_charges!inner(status)').in('financial_entry_id', found).eq('active', true).in('infinitepay_charges.status', ['homologation', 'active']) : { data: [] as any[] }

  const plan = buildChargePlan({ entryIds, entries: entries || [], payments: payments || [], blockedEntryIds: (open || []).map((o: any) => o.financial_entry_id), clientId, contractId, userId: user.id })
  if (!plan.ok) return json(req, { error: plan.error }, 422)
  // O total da tela é só conferência: vale o calculado aqui, no banco.
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
    const payload = live ? checkoutPayload({ handle: settings!.handle, orderNsu, description, amountCents: g.amountCents, redirectUrl: Deno.env.get('PUBLIC_APP_URL') || 'https://lexoffice-ashy.vercel.app/cobranca', webhookUrl }) : { homologation: true, order_nsu: orderNsu, amount_cents: g.amountCents, description }
    const fail = (id: string, msg: string) => Promise.all([
      admin.from('infinitepay_charges').update({ status: 'failed', last_error: msg, updated_at: new Date().toISOString() }).eq('id', id),
      admin.from('infinitepay_charge_items').update({ active: false }).eq('charge_id', id),
    ])
    // 1) Grava a cobrança e RESERVA as parcelas (o índice único barra duas cobranças abertas na mesma parcela)
    //    ANTES de qualquer chamada à InfinitePay — assim nunca nasce um link real sem parcelas.
    const { data: row, error } = await admin.from('infinitepay_charges').insert({
      org_id: org, owner_user_id: user.id, created_by: user.id, client_id: clientId, contract_id: contractId, batch_id: batchId, method, environment,
      order_nsu: orderNsu, webhook_token: webhookToken, amount_cents: g.amountCents, description, due_date: g.dueDate,
      status: live ? 'active' : 'homologation', request_payload: payload,
    }).select('id,status,amount_cents,checkout_url').single()
    if (error || !row) return json(req, { error: 'Não foi possível registrar a cobrança.', created }, 500)
    const { error: itemsError } = await admin.from('infinitepay_charge_items').insert(g.items.map((i: any) => ({ charge_id: row.id, org_id: org, owner_user_id: user.id, financial_entry_id: i.entryId, amount_cents: i.amountCents, active: true })))
    if (itemsError) {
      await fail(row.id, 'parcela já reservada por outra cobrança')
      return json(req, { error: 'Alguma parcela já foi incluída em outra cobrança em aberto. Atualize a lista e tente de novo.', created }, 409)
    }
    // 2) Só então cria o link real (apenas com live_enabled liberado).
    if (live) {
      // Não existe sandbox na InfinitePay: todo link criado é real.
      let providerResponse: unknown = null, checkoutUrl: string | null = null, statusCode = 0
      try {
        const r = await fetch(INFINITEPAY_LINKS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        statusCode = r.status
        providerResponse = await r.json().catch(() => null)
        checkoutUrl = r.ok ? extractCheckoutUrl(providerResponse) : null
      } catch (e) { console.error('infinitepay links', e) }
      if (!checkoutUrl) { await fail(row.id, `InfinitePay não devolveu um link válido (HTTP ${statusCode})`); return json(req, { error: 'A InfinitePay não criou o link. Nada foi cobrado; tente novamente.', created }, 502) }
      const { error: upError } = await admin.from('infinitepay_charges').update({ checkout_url: checkoutUrl, provider_response: providerResponse, updated_at: new Date().toISOString() }).eq('id', row.id)
      if (upError) console.error('infinitepay url não gravada', row.id, checkoutUrl)
      row.checkout_url = checkoutUrl
    }
    created.push(row)
  }
  return json(req, { ok: true, environment, batch_id: batchId, charges: created })
}

// ---------------- Aviso de pagamento ----------------
async function webhook(req: Request, admin: any, payload: any) {
  const token = new URL(req.url).searchParams.get('token') || ''
  const orderNsu = String(payload.order_nsu || ''), txn = String(payload.transaction_nsu || ''), slug = String(payload.invoice_slug || '')
  const log = (result: string, charge: any, verified = false) => admin.from('infinitepay_webhook_events').insert({ charge_id: charge?.id ?? null, org_id: charge?.org_id ?? null, order_nsu: orderNsu || null, transaction_nsu: txn || null, invoice_slug: slug || null, verified, result, payload })
  const { data: charge } = /^[0-9a-f-]{36}$/i.test(orderNsu) ? await admin.from('infinitepay_charges').select('id,org_id,status,environment,amount_cents,webhook_token').eq('order_nsu', orderNsu).maybeSingle() : { data: null }
  // Resposta uniforme para não revelar se a cobrança existe.
  const blocked = webhookGate({ charge, token, txn, slug })
  if (blocked) { await log(blocked, blocked === 'rejected_unknown_or_token' ? (charge ? { id: charge.id, org_id: charge.org_id } : null) : charge); return ok('ignored') }
  const { data: s } = await admin.from('infinitepay_settings').select('handle').eq('org_id', charge.org_id).maybeSingle()
  if (!s?.handle) { await log('no_handle', charge); return new Response('retry', { status: 503 }) }
  // O aviso não tem assinatura: nunca confia no corpo, confirma na InfinitePay.
  const r = await fetch(PAYMENT_CHECK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: s.handle, order_nsu: orderNsu, transaction_nsu: txn, slug }) })
  const reply = await r.json().catch(() => null)
  if (!r.ok) { await log(`check_http_${r.status}`, charge); return new Response('retry', { status: 503 }) } // a InfinitePay reenvia
  if (!paymentConfirmed(reply, charge.amount_cents)) { await log('not_confirmed', charge); return ok('not_confirmed') }
  const { data: res, error } = await admin.rpc('infinitepay_apply_payment', {
    p_charge_id: charge.id, p_transaction_nsu: txn, p_invoice_slug: slug,
    p_paid_amount_cents: Number(reply.paid_amount ?? reply.amount), p_capture_method: reply.capture_method ?? payload.capture_method ?? null,
    p_installments: reply.installments ?? payload.installments ?? null, p_receipt_url: payload.receipt_url ?? null,
  })
  if (error) { await log('apply_error', charge, true); return new Response('retry', { status: 503 }) }
  await log(String(res), charge, true)
  return ok(String(res))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return new Response('unavailable', { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const body: any = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return new Response('bad request', { status: 400 })
  try {
    if (body.action === 'create' || body.action === 'cancel') return await panel(req, admin, body, url)
    return await webhook(req, admin, body)
  } catch (e) { console.error('infinitepay', e); return new Response('error', { status: 500 }) }
})
