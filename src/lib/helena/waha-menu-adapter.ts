import type { Menu, MenuOption } from './menu-contract';

export type WahaInteractivePayload = {
  session: string;
  chatId: string;
  text: string;
  title: string;
  footer: string;
  sections: { title: string; rows: { id: string; title: string; description: string }[] }[];
};
export function buildWahaList(session: string, chatId: string, node: string, menu: Menu): WahaInteractivePayload {
  if (!session.trim() || !/^\d+@(c\.us|s\.whatsapp\.net)$/.test(chatId)) throw new Error('Invalid WAHA session or chat ID');
  if (!menu.options.length || menu.options.length > 10) throw new Error('WAHA menu must contain 1-10 options');
  return {
    session, chatId, text: menu.title, title: 'Atendimento | Helena', footer: 'Selecione uma opção ou escreva sua dúvida.',
    sections: [{ title: 'Como podemos ajudar?', rows: menu.options.map((option: MenuOption) => ({
      id: `${node}:${option.id}`, title: `${option.emoji} ${option.title}`, description: option.description,
    })) }],
  };
}
export function extractWahaChoice(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const root = event as Record<string, unknown>;
  const payload = (root.payload && typeof root.payload === 'object' ? root.payload : root) as Record<string, unknown>;
  const candidates = [payload.selectedRowId, payload.selectedButtonId, payload.buttonOrListid, payload.listResponse, payload.buttonResponse];
  for (const value of candidates) {
    if (typeof value === 'string' && /^[a-z_]+:[a-z_]+$/.test(value)) return value;
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      for (const key of ['id','selectedRowId','selectedButtonId']) {
        if (typeof v[key] === 'string' && /^[a-z_]+:[a-z_]+$/.test(v[key] as string)) return v[key] as string;
      }
    }
  }
  return null;
}
export function shouldShowMenu(text: string, hasActiveConversation: boolean): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  return ['menu','inicio','oi','ola','bom dia','boa tarde','boa noite'].includes(normalized) && !hasActiveConversation;
}
