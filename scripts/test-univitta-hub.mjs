import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../supabase/functions/whatsapp-evolution-connect/hub-client.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {canonical,signature,connectionPath,safeQr,hubToken}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const {privateKey,publicKey}=generateKeyPairSync('ed25519',{privateKeyEncoding:{format:'pem',type:'pkcs8'},publicKeyEncoding:{format:'pem',type:'spki'}});
const identity={private_key:privateKey,application_code:'test-app',request_id:'request',environment:'sandbox'};
const path='/api/public/v2/auth/token',body='{"request_id":"request"}',timestamp='123',nonce='nonce';
const sig=await signature(identity,'POST',path,body,timestamp,nonce);
assert(verify(null,Buffer.from(canonical('POST',path,timestamp,nonce,body)),publicKey,Buffer.from(sig,'base64url')));
assert(!verify(null,Buffer.from(canonical('POST',path,timestamp,nonce,body+' ')),publicKey,Buffer.from(sig,'base64url')));
assert.throws(()=>canonical('GET','https://attacker.invalid','1','2',''));assert.throws(()=>canonical('GET',path+'?x=1','1','2',''));
assert.equal(connectionPath('svc_abc','status'),'/api/public/v1/services/evolution/connections/svc_abc/status');assert.throws(()=>connectionPath('../other','connect'));
assert.equal(safeQr('https://attacker.invalid/track'),null);assert.equal(safeQr('data:image/svg+xml;base64,AAAA'),null);assert.equal(safeQr('data:image/png;base64,AAAA'),'data:image/png;base64,AAAA');
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({access_token:'test',environment:'sandbox'}));assert.equal(await hubToken(identity),'test');
globalThis.fetch=async()=>new Response(JSON.stringify({access_token:'test',environment:'production'}));await assert.rejects(()=>hubToken(identity),/environment mismatch/);
globalThis.fetch=async()=>new Response(JSON.stringify({error:'pending'}),{status:403});await assert.rejects(()=>hubToken(identity),/authorization unavailable/);
globalThis.fetch=originalFetch;
console.log('PASS Hub: Ed25519 interoperable signatures and tamper rejection, strict paths/QR types, authorization failure and environment isolation.');
const helperCode=ts.transpileModule(fs.readFileSync(new URL('../supabase/functions/whatsapp-evolution-connect/univitta-hub.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./hub-client.ts'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64')));
const {handleUnivittaHub}=await import('data:text/javascript;base64,'+Buffer.from(helperCode).toString('base64'));
const saved=new Map();
const db=record=>({from:table=>table==='system_runtime_secrets'?{select:()=>({eq:()=>({maybeSingle:async()=>({data:record?{secret:JSON.stringify(record)}:null,error:null})})})}:{
 select:()=>({eq:(_field,org)=>({eq:()=>({order:()=>({limit:()=>({maybeSingle:async()=>({data:saved.get(org)||null,error:null})})})})})}),
 insert:async row=>{saved.set(row.org_id,{id:row.org_id,external_instance_id:row.external_instance_id,status:row.status});return {error:null}},
 update:()=>({eq:()=>({eq:async()=>({error:null})})})
}});
assert.equal((await handleUnivittaHub(db(null),'office','hub_create')).status,503);
let calls=[];
globalThis.fetch=async(url,opts)=>{calls.push({url:String(url),body:opts?.body});return calls.length%2===1?new Response(JSON.stringify({access_token:'test',environment:'sandbox'})):new Response(JSON.stringify({data:{connection_id:'svc_'+(calls.length===2?'a':'b'),status:'pending'},environment:'sandbox'}))};
const configured={...identity}; 
const first=await (await handleUnivittaHub(db(configured),'office_a','hub_create')).json();
const second=await (await handleUnivittaHub(db(configured),'office_b','hub_create')).json();
assert.equal(first.connection_id,'svc_a');assert.equal(second.connection_id,'svc_b');
assert(calls[1].url.endsWith('/api/public/v1/services/evolution/connections'));
assert.equal(JSON.parse(calls[1].body).owner_ref,'lexoffice:office_a');
assert.equal(JSON.parse(calls[3].body).owner_ref,'lexoffice:office_b');
assert.equal((await handleUnivittaHub(db(configured),'office_a','hub_create')).status,409);
globalThis.fetch=originalFetch;
console.log('PASS handler: one application identity creates separate tenant connections without per-client approvals.');
