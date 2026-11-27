import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDocumentList,documentRequestDescription} from '../src/lib/documentRequests.ts';
test('um documento por linha, sem marcadores nem repetidos',()=>{
  assert.deepEqual(parseDocumentList('- RG e CPF\n\n2) Extratos de 3 meses\nrg e cpf\n  \nx'),['RG e CPF','Extratos de 3 meses']);
});
test('não pede de novo o que está pendente (ignora acento e caixa)',()=>{
  assert.deepEqual(parseDocumentList('Certidão de óbito\nHolerite',['CERTIDAO DE OBITO']),['Holerite']);
});
test('não corta número que faz parte do nome',()=>{
  assert.deepEqual(parseDocumentList('2025 - declaração de IR'),['2025 - declaração de IR']);
});
test('vazio não gera pedido e título longo é limitado',()=>{
  assert.deepEqual(parseDocumentList(' \n\n'),[]);
  assert.equal(parseDocumentList('a'.repeat(500))[0].length,200);
});
test('descrição com prazo em data brasileira; data inválida é omitida',()=>{
  assert.equal(documentRequestDescription('1-2','2026-12-04','Juiz pediu.'),'Juiz pediu. Enviar até 04/12/2026. Processo 1-2.');
  assert.equal(documentRequestDescription('','abc',''),'');
});
