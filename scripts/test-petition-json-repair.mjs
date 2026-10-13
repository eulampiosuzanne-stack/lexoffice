import assert from "node:assert/strict";
import { dossierJsonRepairPrompt, parseModelJson } from "../supabase/functions/petition-assistant/json-utils.ts";

assert.deepEqual(parseModelJson('{"resumo":"ok"}'), { resumo: "ok" });
assert.deepEqual(parseModelJson('```json\n{"resumo":"ok",}\n```'), { resumo: "ok" });
assert.deepEqual(parseModelJson('{"resumo":"texto interrompido'), { resumo: "texto interrompido" });
assert.deepEqual(parseModelJson('{"resumo":"ok","riscos":["um",'), { resumo: "ok", riscos: ["um"] });
assert.throws(() => parseModelJson("sem objeto JSON"), /JSON_OBJECT_NOT_FOUND/);

const broken = '{"riscos":["prescrição" "decadência"]}';
const repairPrompt = dossierJsonRepairPrompt(broken);
assert.match(repairPrompt, /exclusivamente a sintaxe/);
assert.match(repairPrompt, /não acrescente, remova/);
assert.ok(repairPrompt.endsWith(broken));

console.log("petition JSON repair: 8 cenários aprovados");
