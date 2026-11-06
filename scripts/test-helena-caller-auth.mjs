import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateOfficeCaller } from '../supabase/functions/helena-conversation-run/caller-auth.ts';
const req = token => new Request('https://office.invalid', { headers: token ? {authorization:'Bearer '+token,apikey:token} : {} });
test('current internal credential remains accepted without network', async () => {
  assert.equal(await authenticateOfficeCaller(req('current-key'),'current-key','https://project.invalid',async()=>{throw Error('must not call')}),true);
});
test('alternate credentials require project administrator verification', async () => {
  let called=false;
  assert.equal(await authenticateOfficeCaller(req('eyJabc.def.ghi'),'current-key','https://project.invalid',async(url,options)=>{
    called=true;assert.equal(url,'https://project.invalid/auth/v1/admin/users?page=1&per_page=1');assert.equal(options.headers.apikey,'eyJabc.def.ghi');
    return new Response(null,{status:200});
  }),true);
  assert.equal(called,true);
});
test('anonymous or revoked credentials fail administrator verification', async () => {
  for(const status of [401,403,500]) assert.equal(await authenticateOfficeCaller(req('eyJabc.def.ghi'),'current-key','https://project.invalid',async()=>new Response(null,{status})),false);
});
test('missing and malformed credentials are rejected without network', async () => {
  for(const key of ['', 'invalid', 'x'.repeat(4097)]) assert.equal(await authenticateOfficeCaller(req(key),'current-key','https://project.invalid',async()=>{throw Error('must not call')}),false);
});
test('verification failures fail closed', async () => {
  assert.equal(await authenticateOfficeCaller(req('eyJabc.def.ghi'),'current-key','https://project.invalid',async()=>{throw Error('timeout')}),false);
});
