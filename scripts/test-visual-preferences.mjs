import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import postcss from 'postcss';
const code=ts.transpileModule(fs.readFileSync('src/lib/visualPreferences.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {applyVisibility,readVisibility,VISIBILITY_KEY}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const saved=new Map();globalThis.document={documentElement:{dataset:{}}};globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
assert.equal(readVisibility(),false);applyVisibility(true);assert.equal(saved.get(VISIBILITY_KEY),'enhanced');assert.equal(readVisibility(),true);assert.equal(document.documentElement.dataset.lexVision,'enhanced');applyVisibility(false);assert.equal(readVisibility(),false);saved.set(VISIBILITY_KEY,'invalid');assert.equal(readVisibility(),false);globalThis.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};assert.equal(readVisibility(),false);assert.doesNotThrow(()=>applyVisibility(true));assert.equal(document.documentElement.dataset.lexVision,'enhanced');
const luminance=h=>{const rgb=h.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};const contrast=(a,b)=>{a=luminance(a);b=luminance(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
const modes=[];postcss.parse(fs.readFileSync('src/design-system/tokens.css','utf8')).walkRules(rule=>{if(!rule.selector.includes('data-lex-vision'))return;const values={};rule.walkDecls(d=>values[d.prop]=d.value);modes.push(values)});
assert.equal(modes.length,2);for(const [index,values] of modes.entries())for(const bg of index===0?['0b1423','162337','223752','293f5b']:['eef3fa','ffffff','f5f8fd','edf3fb']){assert(contrast(values['--lx-border'].slice(1),bg)>=3,'Control boundary contrast');assert(contrast(values['--lx-text-muted'].slice(1),bg)>=4.5,'Secondary text contrast')}
console.log('PASS visual preferences: on/off, persistence, invalid/blocked storage, session fallback, boundary and text contrast in both themes.');
