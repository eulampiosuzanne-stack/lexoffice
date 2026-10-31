import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChargePlan, groupCharges, checkoutPayload, paymentConfirmed, safeEqual, balanceCents } from '../supabase/functions/infinitepay-create-charge/_shared/infinitepay-core.mjs';
const same = readFileSync('supabase/functions/infinitepay-create-charge/_shared/infinitepay-core.mjs','utf8') === readFileSync('supabase/functions/infinitepay-webhook/_shared/infinitepay-core.mjs','utf8');
assert.ok(same, 'cópias do núcleo divergiram');
const U='u1', C='c1', K='k1';
const inst=(id,n,o={})=>({id,client_id:C,contract_id:K,installment_number:n,due_date:`2026-1${n}-10`,status:'pending',owner_user_id:U,...o});
const ent=(id,i,amount)=>({id,installment_id:i,type:'income',amount});
const base={installments:[inst('i1',1),inst('i2',2),inst('i3',3,{status:'paid'})],entries:[ent('e1','i1',1000.1),ent('e2','i2',500),ent('e3','i3',50)],payments:[{financial_entry_id:'e2',amount:200}],clientId:C,contractId:K,userId:U};
const plan=(ids,o={})=>buildChargePlan({...base,installmentIds:ids,...o});
// positivos
let p=plan(['i1','i2']); assert.ok(p.ok); assert.equal(p.totalCents,100010+30000); // saldo no banco, centavos inteiros
assert.equal(plan(['i2']).totalCents,30000);
assert.equal(groupCharges('recurring',p.items).length,2); assert.equal(groupCharges('pix_card',p.items).length,1); assert.equal(groupCharges('card_only',p.items)[0].amountCents,130010);
// negativos
assert.ok(!plan([]).ok); assert.ok(!plan(['i3']).ok); assert.ok(!plan(['nao']).ok);
assert.ok(!plan(['i1'],{clientId:'outro'}).ok); assert.ok(!plan(['i1'],{userId:'u2'}).ok);
assert.ok(!plan(['i1'],{blockedEntryIds:['e1']}).ok, 'cobrança duplicada');
assert.ok(!plan(['i2'],{payments:[{financial_entry_id:'e2',amount:500}]}).ok, 'sem saldo');
assert.equal(plan(['i1','i1']).items.length,1, 'ids repetidos');
assert.equal(balanceCents(10.1,0),1010);
// payload / confirmação
assert.equal(checkoutPayload({handle:'h',orderNsu:'o',description:'d',amountCents:100010}).items[0].price,100010);
assert.ok(paymentConfirmed({success:true,paid:true,paid_amount:100},100));
assert.ok(!paymentConfirmed({success:true,paid:false,paid_amount:100},100));
assert.ok(!paymentConfirmed({success:false,paid:true,paid_amount:100},100));
assert.ok(!paymentConfirmed({success:true,paid:true,paid_amount:99},100));
assert.ok(!paymentConfirmed(null,100));
assert.ok(safeEqual('abc','abc')); assert.ok(!safeEqual('abc','abd')); assert.ok(!safeEqual('','')); assert.ok(!safeEqual('a','ab'));
// travas de homologação no código
const create=readFileSync('supabase/functions/infinitepay-create-charge/index.ts','utf8');
assert.match(create,/live_enabled && settings\?\.handle/); assert.equal((create.match(/fetch\(/g)||[]).length,1);
console.log('infinitepay: ok');
