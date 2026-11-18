import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAuthorizedProcess} from '../supabase/functions/process-conduction-research/access.mjs';
const id='6aff15b3-aa27-4b6d-9b62-b00a9b863867';
function database(result){const calls=[];const query={select(v){calls.push(['select',v]);return query;},eq(k,v){calls.push(['eq',k,v]);return query;},async maybeSingle(){return result;}};return {calls,from(t){calls.push(['from',t]);return query;}};}
test('uses user-scoped RLS for a visible process owned by a colleague',async()=>{
 const scoped=database({data:{id,owner_user_id:'colleague'},error:null});
 const admin={from(){throw new Error('must not use service role');}};
 assert.equal((await loadAuthorizedProcess(scoped,admin,'office','actor',id)).id,id);
 assert.ok(scoped.calls.some(c=>c[1]==='org_id'&&c[2]==='office'));
 assert.ok(!scoped.calls.some(c=>c[1]==='owner_user_id'));
});
test('invisible or cross-office process does not gain access',async()=>{
 assert.equal(await loadAuthorizedProcess(database({data:null,error:null}),null,'other-office','actor',id),null);
});
test('internal automation keeps owner restriction',async()=>{
 const admin=database({data:{id},error:null});
 await loadAuthorizedProcess(null,admin,'office','actor',id,true);
 assert.ok(admin.calls.some(c=>c[1]==='owner_user_id'&&c[2]==='actor'));
});
test('malformed process IDs never reach the database',async()=>{
 assert.equal(await loadAuthorizedProcess(null,null,'office','actor','invalid'),null);
});
test('database failures are not mislabeled as missing process',async()=>{
 await assert.rejects(loadAuthorizedProcess(database({error:{message:'connection failed'}}),null,'office','actor',id),/verificar o acesso/);
});
