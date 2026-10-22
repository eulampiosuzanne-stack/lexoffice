import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const read=file=>fs.readFileSync(file,'utf8');
for(const file of ['index.html','public/mcp-authorize.html','public/proteger-pdf.html']){const html=read(file);assert(!html.includes('lexoffice-mode'),'Demo build marker in '+file);assert(!html.includes('demo-guard'),'Demo guard in '+file);assert(!html.includes("connect-src 'self'"),'Demo network policy in '+file);}
for(const file of ['src/App.tsx','src/main.tsx','src/lib/supabase.ts']){const source=read(file);assert(!/DEMO_MODE|DemoLogin|DemoToolbar|demoClient|from ['"].*demo\//.test(source),'Demo runtime in '+file);}
assert(!fs.existsSync('src/demo'));assert(!fs.existsSync('public/demo-guard.js'));
assert.equal(crypto.createHash('sha256').update(read('src/lib/supabase.ts')).digest('hex'),'7ee882da8442f80da6c4905689912c4840a681de605b087553b9b6c7f82571d2','Original production Supabase client changed');
assert(fs.statSync('public/Suzanne-Figueiredo.apk').size>0);
const config=JSON.parse(read('vercel.json'));assert.equal(config.git.deploymentEnabled['review/identidade-visual-lexoffice-2026-10-21'],false);assert.equal(config.git.deploymentEnabled.main,undefined);
console.log('PASS production export: no demo runtime/fixtures/network guard, original Supabase client, retained Android download and review-only auto-deploy prevention.');
