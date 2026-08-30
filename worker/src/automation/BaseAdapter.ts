import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { authenticator } from 'otplib';

export interface Credentials {
  username: string;
  password: string;
  twoFactorSeed?: string;
}

export interface ProcessRecord {
  cnjNumber?: string;
  internalNumber?: string;
  subject?: string;
  court?: string;
  status?: string;
  raw?: unknown;
}

export abstract class BaseAdapter {
  protected browser!: Browser;
  protected context!: BrowserContext;
  protected page!: Page;

  constructor(protected readonly baseUrl: string) {}

  abstract login(credentials: Credentials): Promise<void>;
  abstract fetchProcesses(searchPayload: Record<string, unknown>): Promise<ProcessRecord[]>;

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1365, height: 768 },
      locale: 'pt-BR',
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(15_000);
  }

  protected generate2FAToken(seed?: string): string | null {
    if (!seed?.trim()) return null;
    const normalized = seed.replace(/\s+/g, '').toUpperCase();
    return authenticator.generate(normalized);
  }

  protected async detectBlockingChallenge(): Promise<boolean> {
    const body = (await this.page.textContent('body').catch(() => ''))?.toLowerCase() || '';
    return body.includes('captcha') || body.includes('recaptcha') || body.includes('hcaptcha');
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path, fullPage: true }).catch(() => undefined);
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }
}
