process.on('uncaughtException',error=>{console.error(error.message);process.exit(1)});
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import postcss from 'postcss';
const files=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else files.push(p)}}walk('src');
const css=files.filter(f=>f.endsWith('.css'));const tokens=fs.readFileSync('src/design-system/tokens.css','utf8');const defined=new Set([...tokens.matchAll(/(--lx-[\w-]+)\s*:/g)].map(m=>m[1]));
for(const f of css){const ast=postcss.parse(fs.readFileSync(f,'utf8'));ast.walkDecls(d=>{if(!f.endsWith('/tokens.css')){assert(!/var\(--[^,)]*var\(/.test(d.value),`${f}: malformed custom property`);assert(!d.important,`${f}: specificity override ${d.prop}`);assert(!/#[\da-f]{3,8}\b|rgba?\(/i.test(d.value),`${f}: fixed palette ${d.prop}`)}for(const m of d.value.matchAll(/var\((--lx-[\w-]+)/g))assert(defined.has(m[1]),`${f}: undefined ${m[1]}`)});}
for(const f of ['src/shell-layout-fix.css','src/office-brand.css','src/legacy-auth.css'])assert(!fs.existsSync(f));
const main=fs.readFileSync('src/main.tsx','utf8');assert(main.includes('<OfficeBrandBridge>')&&main.indexOf('<OfficeBrandBridge>')<main.indexOf('<BrowserRouter>'));
const bridges=fs.readFileSync('src/OfficeBrandBridge.tsx','utf8');assert(bridges.includes('applyLexTheme')&&bridges.includes('lexoffice-theme-change'));
for(const f of files.filter(f=>f.endsWith('.tsx')))assert(!/<style>\{(?:`|css\}|CSS\})/.test(fs.readFileSync(f,'utf8')),`${f}: injected screen CSS`);
const palette=postcss.parse(tokens);const luminance=h=>{const c=h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
palette.walkRules(rule=>{if(!/data-lex-theme=/.test(rule.selector))return;const values={};rule.walkDecls(d=>values[d.prop]=d.value);for(const fg of ['--lx-text','--lx-text-muted'])for(const bg of ['--lx-canvas','--lx-surface','--lx-surface-raised']){const a=luminance(values[fg]),b=luminance(values[bg]);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${rule.selector}: contrast ${fg}/${bg}`)}});
console.log(`PASS ${css.length} CSS files: semantic palette, complete tokens, no specificity overrides; both themes meet 4.5:1 text contrast.`);
