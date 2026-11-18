import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareDistribution} from './distribution.mjs';
const base={client_id:'c1',cnj_number:'5115033-38.2023.8.13.0024',tribunal_code:'TJMG',judicial_system:'eproc'};
test('aviso contém CNJ e consulta pública oficial para TJMG eproc',()=>{
 const r=prepareDistribution(base,'c1');
 assert.ok(r);
 assert.match(r.message,/5115033-38.2023.8.13.0024/);
 assert.match(r.message,/eproc-consulta-publica-1g.tjmg.jus.br/);
 assert.doesNotMatch(r.message,/acompanhando as próximas movimentações/i);
});
test('não envia para cliente diferente',()=>assert.equal(prepareDistribution(base,'c2'),null));
test('não informa eproc para sistema diferente',()=>{
 const r=prepareDistribution({...base,judicial_system:'PJe'},'c1');
 assert.ok(r);
 assert.equal(r.guideUrl,null);
});
test('não aceita CNJ com dígito verificador inválido',()=>assert.equal(prepareDistribution({...base,cnj_number:'5115033-39.2023.8.13.0024'},'c1'),null));
