import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const failures = [];

async function filesUnder(path, extension) {
  const base = new URL(path, root);
  const out = [];
  async function visit(dir) {
    for (const name of await readdir(dir)) {
      const full = join(dir, name);
      if ((await stat(full)).isDirectory()) await visit(full);
      else if (full.endsWith(extension)) out.push(full);
    }
  }
  await visit(base.pathname);
  return out;
}

const sourceFiles = await filesUnder('src/', '.tsx');
const invoked = new Set();
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/functions\.invoke\(['"]([^'"]+)/g)) invoked.add(match[1]);
}

const functionRoot = new URL('supabase/functions/', root).pathname;
const local = new Set((await readdir(functionRoot, { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name));
const manifest = JSON.parse(await readFile(new URL('supabase/deployed-functions-manifest.json', root), 'utf8'));
const remoteOnly = new Set(manifest.remoteOnly || []);
for (const name of invoked) {
  if (!local.has(name) && !remoteOnly.has(name)) failures.push(`Edge Function sem fonte local ou registro remoto: ${name}`);
}

const pipelinePath = new URL('backend/investigation-engine/src/investigation/PipelineInvestigacao.ts', root);
const pipeline = await readFile(pipelinePath, 'utf8');
for (const forbidden of ['INVESTIGATION_MOCK', "fonte:'mock'", 'DADO SIMULADO']) {
  if (pipeline.includes(forbidden)) failures.push(`Motor de investigação contém marcador proibido: ${forbidden}`);
}

const proxy = await readFile(new URL('api/djen-proxy.ts', root), 'utf8');
if (!proxy.includes("runtime: 'edge'")) failures.push('Proxy DJEN deve usar Edge Runtime.');
if (!proxy.includes('AbortSignal.timeout')) failures.push('Proxy DJEN deve possuir tempo limite de rede.');

if (failures.length) {
  console.error(failures.map(x => `- ${x}`).join('\n'));
  process.exit(1);
}

console.log(`Verificação concluída: ${invoked.size} integrações referenciadas, ${local.size} fontes locais e nenhum dado simulado no pipeline.`);
