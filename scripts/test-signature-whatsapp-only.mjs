import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../src/pages/LexSignPanel.tsx', import.meta.url), 'utf8');
const operator = readFileSync(new URL('../supabase/functions/whatsapp-operator-send/index.ts', import.meta.url), 'utf8');
const gate = readFileSync(new URL('../supabase/functions/whatsapp-outbound-gate/index.ts', import.meta.url), 'utf8');

assert.match(panel, /Assinar pelo sistema LEX/);
assert.match(panel, /Enviar PDFs pelo WhatsApp \(sem assinatura LEX\)/);
assert.match(panel, /document_ids: selected\.map/);
assert.match(panel, /Nenhuma assinatura foi criada na Lex/);
assert.match(operator, /\.eq\("org_id", ctx\.orgId\)\.in\("id", documentIds\)/);
assert.match(operator, /createSignedUrl\(String\(row\.file_path\), 3600\)/);
assert.match(gate, /mediatype:"document"/);
assert.match(gate, /message_type: document \? "document"/);

console.log('assinatura via WhatsApp: 8 cenários de regressão aprovados');
