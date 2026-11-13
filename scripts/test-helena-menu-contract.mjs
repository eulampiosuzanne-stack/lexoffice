import assert from 'node:assert/strict';
import { HELENA_MENUS, validateHelenaMenus } from '../src/lib/helena/menu-contract.ts';
assert.deepEqual(validateHelenaMenus(), []);
assert.deepEqual(HELENA_MENUS.start.options.map(x => x.title), ['Sou cliente', 'Não sou cliente', 'Outros assuntos']);
for (const [key, menu] of Object.entries(HELENA_MENUS)) {
  assert.ok(menu.options.every(x => x.emoji && x.description));
  if (key !== 'start') assert.ok(menu.options.some(x => x.next === 'start'));
}
assert.equal(HELENA_MENUS.client_menu.options.find(x => x.id === 'lawyer')?.agent, 'client_schedule_relationship');
console.log('Helena menu contract: OK (menus, descriptions, routes and scheduling)');
