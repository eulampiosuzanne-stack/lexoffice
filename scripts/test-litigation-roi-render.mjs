import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
globalThis.window={location:{search:'?calc='+encodeURIComponent('ROI Judiciário e Acordos')}};
const server=await createServer({optimizeDeps:{noDiscovery:true,entries:[]},server:{middlewareMode:true},appType:'custom'});
try{
 const {default:Component,fields,names}=await server.ssrLoadModule('/src/pages/Calculators.tsx');
 assert.ok(names.includes('ROI Judiciário e Acordos'));
 const html=renderToStaticMarkup(createElement(Component));
 for(const field of fields['ROI Judiciário e Acordos'])assert.ok(html.includes(field.label),field.key);
 assert.ok(html.includes('Calcular / Gerar'));
 console.log(JSON.stringify({test:'roi_form_render',ok:true,fields:fields['ROI Judiciário e Acordos'].length}));
}finally{await server.close()}
