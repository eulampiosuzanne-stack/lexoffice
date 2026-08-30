import { BaseAdapter, type Credentials, type ProcessRecord } from '../BaseAdapter.js';

const SELECTORS = {
  username: ['input[name="username"]','input[id*="username"]','input[name*="cpf"]','input[id*="cpf"]'],
  password: ['input[name="password"]','input[type="password"]'],
  submit: ['button[type="submit"]','input[type="submit"]','button:has-text("Entrar")'],
  mfa: ['input[name="twoFactorCode"]','input[name*="otp"]','input[id*="otp"]','input[id*="mfa"]','input[autocomplete="one-time-code"]'],
  mfaSubmit: ['button#btnValidarMfa','button[type="submit"]','button:has-text("Validar")','button:has-text("Confirmar")'],
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

export class PjeAdapter extends BaseAdapter {
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
    const url = this.page.url().toLowerCase();
    if (url.includes('login')) throw new Error('LOGIN_NOT_CONFIRMED');
  }

  async fetchProcesses(searchPayload: Record<string, unknown>): Promise<ProcessRecord[]> {
    // Cada versão do PJe possui telas e rotas diferentes. O adaptador só extrai
    // quando uma URL de consulta autenticada e seletores compatíveis forem definidos.
    const queryUrl = String(searchPayload.query_url || '').trim();
    if (!queryUrl) throw new Error('PJE_QUERY_URL_NOT_CONFIGURED');
    await this.page.goto(queryUrl, { waitUntil: 'domcontentloaded' });
    if (await this.detectBlockingChallenge()) throw new Error('CAPTCHA_BLOCKING');
    const rows = await this.page.locator('table tbody tr').all();
    const result: ProcessRecord[] = [];
    for (const row of rows) {
      const text = (await row.innerText().catch(()=>''))?.trim();
      if (!text) continue;
      const cnj = text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0];
      result.push({ cnjNumber: cnj, raw: text });
    }
    return result;
  }
}
