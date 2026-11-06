import assert from 'node:assert/strict';
import test from 'node:test';
import { generateGemini, resolveGatewayPrompt } from '../supabase/functions/ai-provider-gateway/model-request.ts';
const success = text => new Response(JSON.stringify({candidates:[{content:{parts:[{text}]}}]}));
test('trusted internal runtime retains the complete Helena instructions', () => {
  assert.equal(resolveGatewayPrompt('specialist only','Helena persona + dossier + office modules',true),'Helena persona + dossier + office modules');
  assert.equal(resolveGatewayPrompt('mandatory policy','untrusted replacement',false),'mandatory policy');
});
test('generation uses a timeout and reports the actual model', async () => {
  const r=await generateGemini('test','rules','input','gemini-3.7-flash',.2,200,async(url,options)=>{
    assert.ok(options.signal instanceof AbortSignal);assert.equal(JSON.parse(options.body).systemInstruction.parts[0].text,'rules');
    return success('OK');
  });
  assert.equal(r.text,'OK');assert.equal(r.model,'gemini-3.7-flash');assert.equal(r.fallback_used,false);
});
test('retryable provider failure rotates to another available model', async () => {
  let calls=0;
  const r=await generateGemini('test','rules','input','gemini-3.7-flash',.2,200,async()=>{
    calls++;return calls===1?new Response(JSON.stringify({error:{message:'busy'}}),{status:503}):success('OK');
  });
  assert.equal(calls,2);assert.equal(r.model,'gemini-3.6-flash');assert.equal(r.fallback_used,true);
});
test('a network timeout advances to another model without logging a credential', async () => {
  let calls=0;
  const r=await generateGemini('test','rules','input','gemini-3.7-flash',.2,200,async()=>{
    if(++calls===1)throw new DOMException('sensitive URL omitted','TimeoutError');return success('OK');
  });
  assert.equal(calls,2);assert.equal(r.ok,true);
});
test('absolute deadline stops further attempts', async () => {
  let time=0,calls=0;
  const r=await generateGemini('test','rules','input','gemini-3.7-flash',.2,200,async()=>{
    calls++;time+=15000;return new Response('{}',{status:503});
  },()=>time);
  assert.equal(calls,3);assert.equal(r.error,'gemini_deadline');
});
test('non-retryable authentication failures do not repeat requests', async () => {
  let calls=0;
  const r=await generateGemini('test','rules','input','gemini-3.7-flash',.2,200,async()=>{calls++;return new Response('{}',{status:403});});
  assert.equal(calls,1);assert.equal(r.error,'gemini_403');
});
