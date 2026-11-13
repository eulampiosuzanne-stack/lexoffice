export function resolveMenuChoice(message, menu) {
  if (!Array.isArray(menu)) return message;
  const match = message.trim().match(/^(?:op[cç][aã]o\s+)?(10|[1-9])[.!)]?$/i);
  const choice = match ? menu[Number(match[1]) - 1] : menu.find(item => item.id === message.trim());
  if (!choice || typeof choice.title !== 'string') return message;
  if (/^(slot|proc):/.test(String(choice.id))) return match ? match[1] : String(menu.indexOf(choice) + 1);
  return choice.title.replace(/^[\p{Extended_Pictographic}\u200D\uFE0F]+\s*/u, '').trim();
}
