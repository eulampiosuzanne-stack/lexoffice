import {test} from 'node:test';
import assert from 'node:assert/strict';
import {officialUrl,extractResearchSources,renderCitations} from './sources.mjs';
test('somente fontes HTTPS dos domínios oficiais autorizados',()=>{
 for(const url of ['https://www.stj.jus.br/a','https://www.planalto.gov.br/ccivil_03/'])assert.equal(officialUrl(url),true);
 for(const url of ['http://stj.jus.br/a','https://stj.jus.br.evil.test/a','https://eviljus.br/a','javascript:alert(1)','https://jus.br@evil.test/a'])assert.equal(officialUrl(url),false);
});
test('links escritos pela IA sem citação do provedor não são evidência',()=>{
 assert.deepEqual(extractResearchSources([{type:'text',text:'https://www.stj.jus.br/inventado'}]),[]);
});
test('fontes oficiais citadas são deduplicadas e fontes externas são excluídas',()=>{
 const c={type:'web_search_result_location',url:'https://www.stj.jus.br/real',title:'Fonte'};
 assert.equal(extractResearchSources([{type:'text',text:'t',citations:[c,c,{...c,url:'https://example.org'}]}]).length,1);
});
test('referências documentais preservam página e índice sem fabricar URLs',()=>{
 assert.match(renderCitations([{type:'text',text:'Fato',citations:[{document_index:0,start_page_number:291}]}]),/Documento 1, página 291/);
});
