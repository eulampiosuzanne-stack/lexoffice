import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChargePlan, webhookGate, groupCharges, describeCharge, checkoutPayload, extractCheckoutUrl, paymentConfirmed, safeEqual, balanceCents, METHODS } from '../supabase/functions/infinitepay-webhook/_shared/infinitepay-core.mjs';
const U='u1', C='c1', K='k1';
const ent=(id,amount,o={})=>({id,client_id:C,contract_id:K,owner_user_id:U,type:'income',description:`Parcela ${id}`,amount,due_date:'2026-11-10',status:'pending',...o});
const base={entries:[ent('e1',1000.1,{due_date:'2026-12-10'}),ent('e2',500),ent('e3',50,{status:'paid'}),ent('e4',80,{type:'expense'}),ent('e5',70,{contract_id:'outro'})],payments:[{financial_entry_id:'e2',amount:200}],clientId:C,contractId:K,userId:U};
const plan=(ids,o={})=>buildChargePlan({...base,entryIds:ids,...o});
// positivos: saldo vem do banco, em centavos inteiros, ordenado por vencimento
let p=plan(['e1','e2']); assert.ok(p.ok); assert.equal(p.totalCents,100010+30000); assert.equal(p.items[0].entryId,'e2');
assert.equal(plan(['e2']).totalCents,30000);
assert.equal(groupCharges('recurring',p.items).length,2); assert.equal(groupCharges('pix_card',p.items).length,1); assert.equal(groupCharges('pix_card',p.items)[0].amountCents,130010);
assert.ok(describeCharge(p.items).includes('2 parcelas'));
// lançamentos sem installment_id também podem ser cobrados (80 de 95 têm parcela; todos têm contrato)
assert.ok(plan(['e2']).ok);
// negativos
assert.ok(!plan([]).ok); assert.ok(!plan(['e3']).ok, 'paga'); assert.ok(!plan(['e4']).ok, 'despesa'); assert.ok(!plan(['e5']).ok, 'outro contrato'); assert.ok(!plan(['nao']).ok);
assert.ok(!plan(['e1'],{clientId:'outro'}).ok); assert.ok(!plan(['e1'],{userId:'u2'}).ok);
assert.ok(!plan(['e1'],{blockedEntryIds:['e1']}).ok, 'cobrança duplicada');
assert.ok(!plan(['e2'],{payments:[{financial_entry_id:'e2',amount:500}]}).ok, 'sem saldo');
assert.equal(plan(['e1','e1']).items.length,1);
assert.equal(balanceCents(10.1,0),1010);
assert.deepEqual(METHODS,['pix_card','recurring']); // sem "só cartão": exige chave de API
// payload / URL / confirmação
assert.equal(checkoutPayload({handle:'h',orderNsu:'o',description:'d',amountCents:100010}).items[0].price,100010);
const pl=checkoutPayload({handle:'h',orderNsu:'o',description:'d',amountCents:100010,webhookUrl:'https://x/y?token=t'});
assert.deepEqual(pl.webhook,{url:'https://x/y?token=t',events:['paid']}); assert.equal(pl.webhook_url,'https://x/y?token=t'); assert.equal(pl.items.length,1); assert.equal(pl.items[0].quantity,1);
assert.equal(extractCheckoutUrl({url:'https://x/y'}),'https://x/y'); assert.equal(extractCheckoutUrl({link:'https://x'}),'https://x');
assert.equal(extractCheckoutUrl({url:'http://x'}),null); assert.equal(extractCheckoutUrl({url:'javascript:alert(1)'}),null); assert.equal(extractCheckoutUrl(null),null);
assert.ok(paymentConfirmed({success:true,paid:true,paid_amount:100},100));
assert.ok(!paymentConfirmed({success:true,paid:false,paid_amount:100},100));
assert.ok(!paymentConfirmed({success:false,paid:true,paid_amount:100},100));
assert.ok(!paymentConfirmed({success:true,paid:true,paid_amount:99},100));
assert.ok(!paymentConfirmed(null,100));
assert.ok(safeEqual('abc','abc')); assert.ok(!safeEqual('abc','abd')); assert.ok(!safeEqual('','')); assert.ok(!safeEqual('a','ab'));
// aviso de pagamento: negativos
const ch={id:'c',webhook_token:'tok-1234567890',environment:'production',status:'active'};
const gate=(o)=>webhookGate({charge:ch,token:'tok-1234567890',txn:'t',slug:'s',...o});
assert.equal(gate({}),null);
assert.equal(gate({token:''}),'rejected_unknown_or_token','aviso sem token');
assert.equal(gate({token:'errado-1234567'}),'rejected_unknown_or_token','token errado');
assert.equal(gate({charge:null}),'rejected_unknown_or_token','cobrança inexistente');
assert.equal(gate({charge:{...ch,environment:'homologation',status:'homologation'}}),'ignored_homologation','homologação nunca dá baixa');
assert.equal(gate({charge:{...ch,status:'cancelled'}}),'ignored_cancelled'); assert.equal(gate({charge:{...ch,status:'paid'}}),'ignored_paid');
assert.equal(gate({txn:''}),'rejected_missing_fields'); assert.equal(gate({slug:''}),'rejected_missing_fields');
// token correto mas InfinitePay não confirma => não dá baixa
for (const reply of [{success:true,paid:false,paid_amount:100},{success:false,paid:true,paid_amount:100},{success:true,paid:true,paid_amount:50},{},null]) assert.ok(!paymentConfirmed(reply,100));
// travas de homologação no código: uma única criação de link, atrás de live_enabled; sem função nova
const fn=readFileSync('supabase/functions/infinitepay-webhook/index.ts','utf8');
assert.match(fn,/live_enabled && settings\?\.handle/); assert.equal((fn.match(/INFINITEPAY_LINKS, \{/g)||[]).length,1);
assert.match(fn,/infinitepay_apply_payment/);
// ordem: reservar parcelas (itens) ANTES de chamar a InfinitePay, e conferir o erro do insert
assert.ok(fn.indexOf("from('infinitepay_charge_items').insert")<fn.indexOf('fetch(INFINITEPAY_LINKS'),'itens devem ser reservados antes do link');
assert.match(fn,/const \{ error: itemsError \}/); assert.match(fn,/if \(itemsError\)/); assert.match(fn,/payment_check|PAYMENT_CHECK/);
console.log('infinitepay: ok');
