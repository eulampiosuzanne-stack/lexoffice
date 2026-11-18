import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProcessPole, persistProcessRepresentation } from '../src/lib/processRepresentation.ts';

test('canonical and historical poles map to database values',()=>{
  for(const value of ['author','autor','autora','Requerente','exequente']) assert.equal(normalizeProcessPole(value),'author');
  for(const value of ['defendant','reu','Réu','Ré','executado']) assert.equal(normalizeProcessPole(value),'defendant');
  assert.equal(normalizeProcessPole(null),null);
  assert.equal(normalizeProcessPole('desconhecido'),null);
});
function database(result) {
  const calls=[];
  const query={update(patch){calls.push(['update',patch]);return query;},eq(k,v){calls.push(['eq',k,v]);return query;},select(columns){calls.push(['select',columns]);return query;},async maybeSingle(){return result;}};
  return {calls,from(table){calls.push(['from',table]);return query;}};
}
test('saves canonical pole with organization and process scope',async()=>{
  const db=database({data:{id:'process',client_id:'client',pole:'defendant'},error:null});
  const result=await persistProcessRepresentation(db,'process','org',{pole:'reu'});
  assert.equal(result.pole,'defendant');
  assert.deepEqual(db.calls.find(c=>c[0]==='update'),['update',{pole:'defendant'}]);
  assert.ok(db.calls.some(c=>c[0]==='eq'&&c[1]==='org_id'&&c[2]==='org'));
  assert.ok(db.calls.some(c=>c[0]==='eq'&&c[1]==='id'&&c[2]==='process'));
});
test('zero updated rows never report success',async()=>{
  await assert.rejects(persistProcessRepresentation(database({data:null,error:null}),'process','org',{pole:'author'}),/não foi atualizado/);
});
test('database failure and network exception propagate',async()=>{
  const error=new Error('database unavailable');
  await assert.rejects(persistProcessRepresentation(database({data:null,error}),'process','org',{pole:'author'}),/database unavailable/);
  await assert.rejects(persistProcessRepresentation({from(){throw new Error('network')}},'process','org',{pole:'author'}),/network/);
});
test('invalid pole is rejected before any write',async()=>{
  const db=database({data:null,error:null});
  await assert.rejects(persistProcessRepresentation(db,'process','org',{pole:'unknown'}),/polo válido/);
  assert.equal(db.calls.length,0);
});
