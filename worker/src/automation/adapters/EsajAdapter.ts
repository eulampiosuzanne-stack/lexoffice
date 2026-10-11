import { BaseAdapter, type Credentials, type ProcessRecord } from '../BaseAdapter.js';

const SELECTORS = {
  username: ['input[name="username"]','input[name="j_username"]','input[id*="usuario"]','input[id*="username"]','input[name*="cpf"]'],
  password: ['input[name="password"]','input[name="j_password"]','input[id*="senha"]','input[type="password"]'],
  submit: ['button[type="submit"]','input[type="submit"]','button:has-text("Entrar")','button:has-text("Acessar")'],
  mfa: ['input[name*="token"]','input[name*="otp"]','input[id*="token"]','input[id*="otp"]','input[autocomplete="one-time-code"]'],
  mfaSubmit: ['button[type="submit"]','button:has-text("Validar")','button:has-text("Confirmar")'],
};

async function firstVisible(page:any, selectors:string[]) {
  for (const selector of selectors) {
    const loc=page.locator(selector).first();
    if (await loc.count().catch(()=>0) && await loc.isVisible().catch(()=>false)) return loc;
  }
  return null;
}

export class EsajAdapter extends BaseAdapter {
  async login(credentials:Credentials):Promise<void> {
    await this.init();
    await this.page.goto(this.baseUrl,{waitUntil:'domcontentloaded'});
    if(await this.detectBlockingChallenge()) throw new Error('CAPTCHA_BLOCKING');
    const user=await firstVisible(this.page,SELECTORS.username);
    const pass=await firstVisible(this.page,SELECTORS.password);
    if(!user||!pass) throw new Error('LOGIN_LAYOUT_NOT_RECOGNIZED');
    await user.fill(credentials.username);
    await pass.fill(credentials.password);
    const submit=await firstVisible(this.page,SELECTORS.submit);
    if(!submit) throw new Error('LOGIN_SUBMIT_NOT_FOUND');
    await submit.click();
    await this.page.waitForLoadState('domcontentloaded').catch(()=>undefined);
    if(await this.detectBlockingChallenge()) throw new Error('CAPTCHA_BLOCKING');
    const mfa=await firstVisible(this.page,SELECTORS.mfa);
    if(mfa){
      const token=this.generate2FAToken(credentials.twoFactorSeed);
      if(!token) throw new Error('TOTP_SEED_REQUIRED');
      await mfa.fill(token);
      const ok=await firstVisible(this.page,SELECTORS.mfaSubmit);
      if(!ok) throw new Error('MFA_SUBMIT_NOT_FOUND');
      await ok.click();
      await this.page.waitForLoadState('domcontentloaded').catch(()=>undefined);
    }
    if(await this.detectBlockingChallenge()) throw new Error('CAPTCHA_BLOCKING');
    const body=((await this.page.locator('body').innerText().catch(()=>''))||'').toLowerCase();
    if(/senha inválida|usuário inválido|login inválido|credenciais inválidas/.test(body)) throw new Error('LOGIN_NOT_CONFIRMED');
  }

  async fetchProcesses(searchPayload:Record<string,unknown>):Promise<ProcessRecord[]> {
    const queryUrl=String(searchPayload.query_url||'').trim();
    if(!queryUrl) throw new Error('ESAJ_QUERY_URL_NOT_CONFIGURED');
    await this.page.goto(queryUrl,{waitUntil:'domcontentloaded'});
    if(await this.detectBlockingChallenge()) throw new Error('CAPTCHA_BLOCKING');
    const body=await this.page.locator('body').innerText();
    const cnjs=[...body.matchAll(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g)].map(m=>m[0]);
    return [...new Set(cnjs)].map(cnjNumber=>({cnjNumber,raw:{source:'esaj',queryUrl}}));
  }
}
