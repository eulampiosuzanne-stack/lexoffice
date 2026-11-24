import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync("supabase/functions/signature-biometric-public/index.ts", "utf8");
assert.match(src, /copyPages\(pdf, pdf\.getPageIndices\(\)\)/, "PDF com objeto de geração ≠ 0 deve ser recriado por copyPages");
assert.match(src, /useObjectStreams: false/, "PDF assinado deve ser gravado sem object streams");
const re = /(^|[\r\n])\d+ [1-9]\d* obj/;
assert.ok(re.test("%PDF-1.4\n8 1 obj\n<<>>\nendobj"), "deve detectar '8 1 obj'");
assert.ok(!re.test("%PDF-1.4\n8 0 obj\n<<>>\nendobj"), "não deve detectar '8 0 obj'");
console.log("signature-pdf-normalize OK");
