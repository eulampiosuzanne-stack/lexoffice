import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://dcpwcuototomxoiszukt.supabase.co/**',async route=>{
  const body=route.request().postDataJSON();
  await route.fulfill({json:body?.action==='status'?{
   configured:true,embedded_ready:true,app_id:'1520469169796415',embedded_configuration_id:'1990304364939008',
   connection:{status:'disconnected'},
  }:{connected:true}});
 });
 await page.addInitScript(()=>{
  (window as any).FB={init(){},login(callback:any,options:any){
   (window as any).metaCallback=callback;(window as any).metaOptions=options;
  }};
 });
 await page.goto('/tests/fixtures/meta.html');
 await expect(page.getByRole('button',{name:'Conectar como parceiro',exact:true})).toBeEnabled();
});

test('code alone never exchanges or reports connected',async({page})=>{
 const exchanges:string[]=[];
 page.on('request',r=>{if(r.postData()?.includes('embedded_exchange'))exchanges.push(r.postData()!)});
 await page.getByRole('button',{name:'Conectar como parceiro',exact:true}).click();
 await page.evaluate(()=>(window as any).metaCallback({authResponse:{code:'test-code'}}));
 await expect(page.getByRole('button',{name:'Conectando...',exact:true})).toBeVisible();
 expect(exchanges).toHaveLength(0);
 await expect(page.getByText('Conta e número validados pela Meta.',{exact:false})).toHaveCount(0);
});

test('selected assets and code are required; malicious origin is ignored',async({page})=>{
 await page.getByRole('button',{name:'Conectar como parceiro',exact:true}).click();
 await page.evaluate(()=>{
  (window as any).metaCallback({authResponse:{code:'test-code'}});
  window.dispatchEvent(new MessageEvent('message',{origin:'https://facebook.com.attacker.invalid',data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'123',phone_number_id:'456'}}}));
 });
 await expect(page.getByRole('button',{name:'Conectando...',exact:true})).toBeVisible();
 const request=page.waitForRequest(r=>r.postData()?.includes('embedded_exchange')===true);
 await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',data:{waba_id:'123',phone_number_id:'456'}}})));
 expect((await request).postDataJSON()).toEqual({action:'embedded_exchange',code:'test-code',waba_id:'123',phone_number_id:'456'});
 await expect(page.getByText('Teste de mensagens ainda pendente.',{exact:false})).toBeVisible();
});

test('backend rejection does not report successful connection',async({page})=>{
 await page.route('**/functions/v1/meta-whatsapp-oauth',async route=>{
  const body=route.request().postDataJSON();
  await route.fulfill({json:body.action==='embedded_exchange'?{error:'Número não pertence à WABA selecionada.'}:{configured:true,embedded_ready:true,app_id:'1520469169796415',embedded_configuration_id:'1990304364939008'}});
 });
 await page.getByRole('button',{name:'Conectar como parceiro',exact:true}).click();
 await page.evaluate(()=>{
  window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:JSON.stringify({type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'123',phone_number_id:'456'}})}));
  (window as any).metaCallback({authResponse:{code:'test-code'}});
 });
 await expect(page.getByText('Número não pertence à WABA selecionada.')).toBeVisible();
 await expect(page.getByText('Teste de mensagens ainda pendente.',{exact:false})).toHaveCount(0);
});
