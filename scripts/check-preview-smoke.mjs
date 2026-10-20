import fs from 'node:fs';
const base = 'http://127.0.0.1:4173';
for (const route of ['/', '/whatsapp', '/clientes']) {
  const response = await fetch(base + route);
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${route}`);
  const html = await response.text();
  if (!html.includes('id="root"')) throw new Error(`React root missing at ${route}`);
  const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
  if (!scripts.length) throw new Error(`Compiled JS missing at ${route}`);
  for (const asset of scripts) {
    const assetResponse = await fetch(base + asset);
    if (!assetResponse.ok) throw new Error(`Missing asset: ${asset}`);
  }
}
if (!fs.existsSync('dist/index.html')) throw new Error('dist/index.html missing');
console.log('SPA routes and JS assets OK.');
