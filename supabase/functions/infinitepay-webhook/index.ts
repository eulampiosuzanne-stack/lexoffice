import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { paymentConfirmed, safeEqual } from './_shared/infinitepay-core.mjs'

const PAYMENT_CHECK = 'https://api.checkout.infinitepay.io/payment_check'
const ok = (result: string) => new Response(JSON.stringify({ result }), { status: 200, headers: { 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return new Response('unavailable', { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const payload: any = await req.json().catch(() => null)
  if (!payload || typeof payload !== 'object') return new Response('bad request', { status: 400 })
  const token = new URL(req.url).searchParams.get('token') || ''
  const orderNsu = String(payload.order_nsu || ''), txn = String(payload.transaction_nsu || ''), slug = String(payload.invoice_slug || '')
  const log = (result: string, charge: any, verified = false) => admin.from('infinitepay_webhook_events').insert({ charge_id: charge?.id ?? null, org_id: charge?.org_id ?? null, order_nsu: orderNsu || null, transaction_nsu: txn || null, invoice_slug: slug || null, verified, result, payload })

  const uuid = /^[0-9a-f-]{36}$/i
  const { data: charge } = uuid.test(orderNsu) ? await admin.from('infinitepay_charges').select('id,org_id,status,environment,amount_cents,webhook_token').eq('order_nsu', orderNsu).maybeSingle() : { data: null }
  // Resposta uniforme para não revelar se a cobrança existe.
  if (!charge || !safeEqual(charge.webhook_token, token)) { await log('rejected_unknown_or_token', charge ? { id: charge.id, org_id: charge.org_id } : null); return ok('ignored') }
  if (charge.environment !== 'production' || charge.status !== 'active') { await log(`ignored_${charge.status}`, charge); return ok('ignored') }
  if (!txn || !slug) { await log('rejected_missing_fields', charge); return ok('ignored') }

  const { data: s } = await admin.from('infinitepay_settings').select('handle').eq('org_id', charge.org_id).maybeSingle()
  if (!s?.handle) { await log('no_handle', charge); return new Response('retry', { status: 503 }) }
  // Nunca confia no corpo do aviso: confirma na InfinitePay.
  const r = await fetch(PAYMENT_CHECK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: s.handle, order_nsu: orderNsu, transaction_nsu: txn, slug }) })
  const reply = await r.json().catch(() => null)
  if (!r.ok) { await log(`check_http_${r.status}`, charge); return new Response('retry', { status: 503 }) } // InfinitePay reenvia
  if (!paymentConfirmed(reply, charge.amount_cents)) { await log('not_confirmed', charge); return ok('not_confirmed') }

  const { data: res, error } = await admin.rpc('infinitepay_apply_payment', {
    p_charge_id: charge.id, p_transaction_nsu: txn, p_invoice_slug: slug,
    p_paid_amount_cents: Number(reply.paid_amount ?? reply.amount), p_capture_method: reply.capture_method ?? payload.capture_method ?? null,
    p_installments: reply.installments ?? payload.installments ?? null, p_receipt_url: payload.receipt_url ?? null,
  })
  if (error) { await log('apply_error', charge, true); return new Response('retry', { status: 503 }) }
  await log(String(res), charge, true)
  return ok(String(res))
})
