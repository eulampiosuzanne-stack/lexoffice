import { BaseAdapter } from './BaseAdapter.js';
import { PjeAdapter } from './adapters/PjeAdapter.js';
import { EprocAdapter } from './adapters/EprocAdapter.js';

export class AdapterFactory {
  static getAdapter(judicialSystem: string, baseUrl: string): BaseAdapter {
    const system = judicialSystem.trim().toLowerCase();
    if (!baseUrl) throw new Error('COURT_BASE_URL_REQUIRED');
    if (system.includes('pje')) return new PjeAdapter(baseUrl);
    if (system.includes('eproc')) return new EprocAdapter(baseUrl);
    throw new Error(`ADAPTER_NOT_SUPPORTED:${judicialSystem}`);
  }
}
