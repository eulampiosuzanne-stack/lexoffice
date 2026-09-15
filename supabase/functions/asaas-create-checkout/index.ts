import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = new Set(['https://lexoffice-ashy.vercel.app','http://localhost:5173','http://127.0.0.1:5173'])
function cors(req: Request) {
  const origin=req.headers.get('origin')||''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin)?origin:'https://lexoffice-ashy.vercel.app',
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
  }
}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'no-store'}})}

const PLANOS={
  essencial:{name:'LexOffice Essencial',value:149},
  profissional:{name:'LexOffice Profissional',value:299},
  avancado:{name:'LexOffice Avançado',value:499},
} as const
type Plano=keyof typeof PLANOS

serve(async(req)=>{
  if(req.method==='OPTIONS'){
    const origin=req.headers.get('origin')||''
    if(origin&&!allowedOrigins.has(origin)) return new Response('Origin not allowed',{status:403})
    return new Response('ok',{headers:cors(req)})
  }
  if(req.method!=='POST') return json(req,{error:'Método não permitido.'},405)
  const origin=req.headers.get('origin')||''
  if(origin&&!allowedOrigins.has(origin)) return json(req,{error:'Origem não permitida.'},403)

  try{
    const apiKey=Deno.env.get('ASAAS_API_KEY')
    const environment=Deno.env.get('ASAAS_ENV')||'sandbox'
    const appUrl=Deno.env.get('PUBLIC_APP_URL')||'https://lexoffice-ashy.vercel.app'
    const supabaseUrl=Deno.env.get('SUPABASE_URL')
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if(!apiKey) return json(req,{error:'Integração Asaas ainda não configurada.'},503)
    if(!supabaseUrl||!serviceKey) return json(req,{error:'Configuração interna indisponível.'},503)

    const body=await req.json()
    const plano=String(body.plano||'') as Plano
    if(!(plano in PLANOS)) return json(req,{error:'Plano inválido.'},400)
    const name=String(body.name||'').trim()
    const officeName=String(body.officeName||'').trim()
    const cpfCnpj=String(body.cpfCnpj||'').replace(/\D/g,'')
    const phone=String(body.phone||'').replace(/\D/g,'')
    const email=String(body.email||'').trim().toLowerCase()
    if(!name||!officeName||!cpfCnpj||!phone||!email) return json(req,{error:'Preencha todos os dados do escritório.'},400)

    const baseUrl=environment==='production'?'https://api.asaas.com/v3':'https://api-sandbox.asaas.com/v3'
    const plan=PLANOS[plano]
    const nextDueDate=new Date(); nextDueDate.setDate(nextDueDate.getDate()+7)
    const payload={
      billingTypes:['CREDIT_CARD'], chargeTypes:['RECURRENT'], minutesToExpire:60,
      callback:{
        successUrl:`${appUrl}/checkout/sucesso?plano=${plano}`,
        cancelUrl:`${appUrl}/checkout?plano=${plano}&status=cancelado`,
        expiredUrl:`${appUrl}/checkout?plano=${plano}&status=expirado`,
      },
      customerData:{name,cpfCnpj,email,phone},
      items:[{name:plan.name,description:`${officeName} · assinatura mensal LexOffice`,quantity:1,value:plan.value}],
      subscription:{cycle:'MONTHLY',nextDueDate:nextDueDate.toISOString().slice(0,19).replace('T',' ')},
    }
    const response=await fetch(`${baseUrl}/checkouts`,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'LexOffice/1.0',access_token:apiKey},body:JSON.stringify(payload)})
    const data=await response.json()
    if(!response.ok){console.error('Asaas checkout error',response.status,data);return json(req,{error:'Não foi possível iniciar o pagamento.',details:data?.errors},502)}
    const checkoutId=String(data.id||'')
    const checkoutUrl=data.url||data.checkoutUrl||(checkoutId?`https://asaas.com/checkoutSession/show?id=${checkoutId}`:null)
    if(!checkoutId||!checkoutUrl) return json(req,{error:'O provedor não retornou uma sessão de pagamento válida.'},502)

    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
    const {error:orderError}=await admin.from('commercial_checkout_orders').upsert({
      checkout_id:checkoutId, provider:'asaas', plan:plano, amount_cents:Math.round(plan.value*100),
      customer_name:name, office_name:officeName, customer_email:email, customer_phone:phone,
      customer_document:cpfCnpj, status:'pending', metadata:{environment}
    },{onConflict:'checkout_id'})
    if(orderError){console.error('checkout ledger error',orderError);return json(req,{error:'Pagamento criado, mas a ativação automática não pôde ser preparada. Tente novamente.'},503)}
    return json(req,{checkoutId,checkoutUrl,environment})
  }catch(error){console.error(error);return json(req,{error:'Erro interno ao iniciar a contratação.'},500)}
})
