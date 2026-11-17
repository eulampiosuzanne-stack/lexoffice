import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geminiParts,groundedContent,resolveGroundedUrl,selectGeminiModel} from './gemini.mjs';
test('preserva texto e PDF nativo sem tratar base64 como texto',()=>{
 assert.deepEqual(geminiParts([{type:'document',source:{type:'base64',media_type:'application/pdf',data:'JVBERg=='}}]),[{inlineData:{mimeType:'application/pdf',data:'JVBERg=='}}]);
 assert.throws(()=>geminiParts([{type:'file',source:{type:'url',url:'http://example.org'}}]));
});
test('aceita somente as fontes oficiais ligadas pelo grounding à resposta',()=>{
 const candidate={content:{parts:[{text:'Tese.'}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://www.stj.jus.br/a',title:'STJ'}},{web:{uri:'https://evil.test/a',title:'Externo'}},{web:{uri:'https://www.tjmg.jus.br/nao-citado',title:'Não citado'}}],groundingSupports:[{segment:{text:'Tese.'},groundingChunkIndices:[0,1]}]}};
 const content=groundedContent(candidate,new Map());assert.equal(content[0].citations.length,1);assert.equal(content[0].citations[0].url,'https://www.stj.jus.br/a');
});
test('não segue links arbitrários nem redirecionamentos para rede interna',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})};
 assert.equal(await resolveGroundedUrl('http://127.0.0.1/private',fetcher),null);assert.equal(calls,0);
 assert.equal(await resolveGroundedUrl('https://vertexaisearch.cloud.google.com/grounding-api-redirect/test',fetcher),null);assert.equal(calls,1);
});
test('resolve redirecionamento Google somente para domínio oficial HTTPS',async()=>{
 assert.equal(await resolveGroundedUrl('https://vertexaisearch.cloud.google.com/grounding-api-redirect/test',async()=>new Response(null,{status:302,headers:{location:'https://www.stj.jus.br/real'}})),'https://www.stj.jus.br/real');
});

test('seleciona modelo estável atual e compatível em vez de versão antiga anunciada',()=>{
 const m=name=>({name,supportedGenerationMethods:['generateContent']});
 assert.equal(selectGeminiModel([m('models/gemini-2.5-flash'),m('models/gemini-3.8-flash'),m('models/gemini-9.0-flash-image')]),'models/gemini-3.8-flash');
});

test('explica a cota diária em português sem expor resposta bruta do provedor',async()=>{
 const {geminiErrorMessage}=await import('./gemini.mjs');
 const message=geminiErrorMessage({error:{message:'raw provider message',details:[{violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier',quotaValue:'20'}]}]}},429);
 assert.match(message,/20 solicitações por dia/);assert.doesNotMatch(message,/raw provider/);
});
