import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateLitigationRoi } from '../src/lib/litigationRoi.ts';
const base={claimValue:100000,successPercent:60,recoveryPercent:100,durationYears:2,annualDiscountPercent:10,costNow:5000,costAtEnd:1000,settlementValue:45000,settlementYears:0,settlementCost:1000};
const near=(a,b)=>assert.ok(Math.abs(a-b)<.000001, a+' != '+b);
test('expected receipts and future costs are discounted with compound interest',()=>{
 const r=calculateLitigationRoi(base);near(r.meta.litigation,(60000-1000)/1.21-5000);near(r.meta.settlement,44000);near(r.meta.difference,44000-r.meta.litigation);
});
test('zero discount and zero duration do not cause division errors',()=>{
 const r=calculateLitigationRoi({...base,annualDiscountPercent:0,durationYears:0});near(r.meta.litigation,54000);
});
test('zero success retains all explicit litigation costs rather than inventing a return',()=>{
 const r=calculateLitigationRoi({...base,successPercent:0});near(r.meta.litigation,-1000/1.21-5000);
});
test('conditional recovery is independent of the success hypothesis',()=>{
 const r=calculateLitigationRoi({...base,recoveryPercent:50});near(r.meta.litigation,(30000-1000)/1.21-5000);
});
test('delayed settlement is discounted and its costs are deducted once',()=>{
 const r=calculateLitigationRoi({...base,settlementYears:1});near(r.meta.settlement,45000/1.1-1000);
});
test('no settlement is distinct from an explicit zero offer',()=>{
 const no=calculateLitigationRoi({...base,settlementValue:''}),zero=calculateLitigationRoi({...base,settlementValue:0});
 assert.equal(no.meta.settlement,null);assert.equal(zero.meta.settlement,-1000);
});
test('missing core assumptions are rejected, including empty or whitespace input',()=>{
 for(const key of ['claimValue','successPercent','recoveryPercent','durationYears','annualDiscountPercent','costNow','costAtEnd']){
  for(const val of [undefined,'',' '])assert.throws(()=>calculateLitigationRoi({...base,[key]:val}));
 }
});
test('invalid ranges and non-finite values cannot silently become zero',()=>{
 for(const val of [-1,NaN,Infinity,'invalid',true])assert.throws(()=>calculateLitigationRoi({...base,claimValue:val}));
 for(const key of ['successPercent','recoveryPercent'])assert.throws(()=>calculateLitigationRoi({...base,[key]:101}));
});
test('settlement timing and costs must be explicit if an offer exists',()=>{
 assert.throws(()=>calculateLitigationRoi({...base,settlementYears:undefined}));
 assert.throws(()=>calculateLitigationRoi({...base,settlementCost:''}));
});
test('Brazilian monetary input is parsed and scenario hypotheses stay bounded',()=>{
 const r=calculateLitigationRoi({...base,claimValue:'R$ 100.000,00',successPercent:100});
 assert.equal(r.meta.assumptions.claim,100000);assert.ok(r.meta.scenarios.every(s=>s.probability>=0&&s.probability<=1));
 assert.match(r.result,/Não estima automaticamente/);
});
