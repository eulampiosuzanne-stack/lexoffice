import { BaseAdapter, type Credentials, type ProcessRecord } from '../BaseAdapter.js';

const SELECTORS = {
  username: ['input[name="txtUsuario"]','input[name="username"]','input[id*="usuario"]'],
  password: ['input[name="pwdSenha"]','input[name="password"]','input[type="password"]'],
  submit: ['button[type="submit"]','input[type="submit"]','button:has-text("Entrar")'],
  mfa: ['input[name*="token"]','input[name*="otp"]','input[id*="token"]','input[autocomplete="one-time-code"]'],
  mfaSubmit: ['button[type="submit"]','button:has-text("Validar")','button:has-text("Confirmar")'],
};

async function firstVisible(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count().catch(()=>0)) {
      if (await loc.isVisible().catch(()=>false)) return loc;
    }
  }
  return null;
}

export class EprocAdapter extends BaseAdapter {
  async login(credentials: Credentials): Promise<void> {
    await this.init();
    await this.page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' });
    if (await this.detectBlockingChallenge()) throw new Error('CAPTCHA_BLOCKING');
    const user = await firstVisible(this.page, SELECTORS.username);
    const pass = await firstVisible(this.page, SELECTORS.password);
    if (!user || !pass) throw new Error('LOGIN_LAYOUT_NOT_RECOGNIZED');
    await user.fill(credentials.username);
    await pass.fill(credentials.password);
    const submit = await firstVisible(this.page, SELECTORS.submit);
    if (!submit) throw new Error('LOGIN_SUBMIT_NOT_FOUND');
    await submit.click();
    await this.page.waitForLoadState('domcontentloaded').catch(()=>undefined);
    if (await this.detectBlockingChallenge()) throw new Error('CAPTCHA_BLOCKING');
    const mfa = await firstVisible(this.page, SELECTORS.mfa);
    if (mfa) {
      const token = this.generate2FAToken(credentials.twoFactorSeed);
      if (!token) throw new Error('TOTP_SEED_REQUIRED');
      await mfa.fill(token);
      const mfaSubmit = await firstVisible(this.page, SELECTORS.mfaSubmit);
      if (!mfaSubmit) throw new Error('MFA_SUBMIT_NOT_FOUND');
      await mfaSubmit.click();
      await this.page.waitForLoadState('domcontentloaded').catch(()=>undefined);
    }
    if (await this.detectBlockingChallenge()) throw new Error('CAPTCHA_BLOCKING');
  }

  async fetchProcesses(searchPayload: Record<string, unknown>): Promise<ProcessRecord[]> {
    const queryUrl = String(searchPayload.query_url || '').trim();
    if (!queryUrl) throw new Error('EPROC_QUERY_URL_NOT_CONFIGURED');
    await this.page.goto(queryUrl, { waitUntil: 'domcontentloaded' });
    if (await this.detectBlockingChallenge()) throw new Error('CAPTCHA_BLOCKING');
    const body = await this.page.locator('body').innerText();
    const matches = [...body.matchAll(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g)].map(m=>m[0]);
    return [...new Set(matches)].map(cnjNumber=>({cnjNumber}));
  }
}
