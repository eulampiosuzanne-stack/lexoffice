export function resolveMenuChoice(message, menu) {
  if (!Array.isArray(menu)) return message;
  const match = message.trim().match(/^(?:op[cç][aã]o\s+)?(10|[1-9])[.!)]?$/i);
  const choice = match ? menu[Number(match[1]) - 1] : menu.find(item => item.id === message.trim());
  if (!choice || typeof choice.title !== 'string') return message;
  if (String(choice.id).startsWith('slot:')) return message;
  return choice.title.replace(/^\p{Extended_Pictographic}\s*/u, '').trim();
}
