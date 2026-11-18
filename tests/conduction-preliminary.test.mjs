import test from 'node:test';
import assert from 'node:assert/strict';
import { caseFileMode, preliminaryContext, markPreliminaryDraft } from '../supabase/functions/process-conduction-research/preliminary.mjs';
test('permite minuta sem autos, inclusive modo padrão',()=>{for(const mode of [undefined,'draft'])assert.deepEqual(caseFileMode([],mode),{preliminary:true,blocked:false});});
test('preserva bloqueio de relatório ao cliente sem autos',()=>assert.deepEqual(caseFileMode([],'client_report'),{preliminary:false,blocked:true}));
test('com autos mantém os fluxos completos',()=>{for(const mode of ['draft','client_report'])assert.deepEqual(caseFileMode([{id:'documento'}],mode),{preliminary:false,blocked:false});});
test('documentos ausentes são tratados como faltantes',()=>assert.deepEqual(caseFileMode(null,'draft'),{preliminary:true,blocked:false}));
test('minuta sempre recebe ressalva preservando o texto',()=>{const result=markPreliminaryDraft('PEDIDOS');assert.match(result,/^MINUTA PRELIMINAR — AUTOS NÃO LIDOS/);assert.ok(result.endsWith('PEDIDOS'));});
test('orientação proíbe alegar leitura e exige conferência',()=>{assert.match(preliminaryContext,/Não declare leitura integral/);assert.match(preliminaryContext,/PREENCHER \/ CONFERIR NOS AUTOS/);});
