import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync("src/pages/Clients.tsx", "utf8");
const fn = src.slice(src.indexOf("async function openDoc("), src.indexOf("async function deleteClient("));
assert.match(fn, /a\.download = fileName/, "download deve usar blob com nome de arquivo");
assert.match(fn, /\.pdf`/, "documentos PDF devem sair com extensão .pdf");
assert.doesNotMatch(fn, /download: download \? d\.name/, "não usar mais o nome sem extensão");
assert.match(fn, /não tem versão PDF/, "Word enviado pelo cliente deve avisar que não há PDF");
console.log("client-doc-pdf OK");
