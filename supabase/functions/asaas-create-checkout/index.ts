import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PLANOS = {
  essencial: { name: 'LexOffice Essencial', value: 149 },
  profissional: { name: 'LexOffice Profissional', value: 299 },
  avancado: { name: 'LexOffice Avançado', value: 499 },
} as const

type Plano = keyof typeof PLANOS

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const apiKey = Deno.env.get('ASAAS_API_KEY')
    const environment = Deno.env.get('ASAAS_ENV') || 'sandbox'
    const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://lexoffice-ashy.vercel.app'
    if (!apiKey) return json({ error: 'Integração Asaas ainda não configurada.' }, 503)

    const body = await req.json()
    const plano = String(body.plano || '') as Plano
    if (!(plano in PLANOS)) return json({ error: 'Plano inválido.' }, 400)

    const name = String(body.name || '').trim()
    const officeName = String(body.officeName || '').trim()
    const cpfCnpj = String(body.cpfCnpj || '').replace(/\D/g, '')
    const phone = String(body.phone || '').replace(/\D/g, '')
    const email = String(body.email || '').trim().toLowerCase()
    if (!name || !officeName || !cpfCnpj || !phone || !email) {
      return json({ error: 'Preencha todos os dados do escritório.' }, 400)
    }

    const baseUrl = environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3'

    const plan = PLANOS[plano]
    const nextDueDate = new Date()
    nextDueDate.setDate(nextDueDate.getDate() + 7)
    const nextDueDateString = nextDueDate.toISOString().slice(0, 19).replace('T', ' ')

    const payload = {
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: 60,
      callback: {
        successUrl: `${appUrl}/checkout/sucesso?plano=${plano}`,
        cancelUrl: `${appUrl}/checkout?plano=${plano}&status=cancelado`,
        expiredUrl: `${appUrl}/checkout?plano=${plano}&status=expirado`,
      },
      customerData: {
        name,
        cpfCnpj,
        email,
        phone,
      },
      items: [{
        name: plan.name,
        description: `${officeName} · assinatura mensal LexOffice`,
        quantity: 1,
        value: plan.value,
      }],
      subscription: {
        cycle: 'MONTHLY',
        nextDueDate: nextDueDateString,
      },
    }

    const response = await fetch(`${baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LexOffice/1.0',
        access_token: apiKey,
      },
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) {
      console.error('Asaas checkout error', response.status, data)
      return json({ error: 'Não foi possível iniciar o pagamento.', details: data?.errors }, 502)
    }

    const checkoutId = data.id
    const checkoutUrl = data.url || data.checkoutUrl || (checkoutId ? `https://asaas.com/checkoutSession/show?id=${checkoutId}` : null)
    return json({ checkoutId, checkoutUrl, environment })
  } catch (error) {
    console.error(error)
    return json({ error: 'Erro interno ao iniciar a contratação.' }, 500)
  }
})
