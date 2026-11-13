import assert from 'node:assert/strict';
import {HELENA_AUTOMATIC_MESSAGES,validateAutomaticMessages} from '../src/lib/helena/automatic-messages.ts';
assert.equal(HELENA_AUTOMATIC_MESSAGES.length,36);
assert.deepEqual(validateAutomaticMessages(),[]);
assert.equal(new Set(HELENA_AUTOMATIC_MESSAGES.map(x=>x.id)).size,36);
assert.ok(HELENA_AUTOMATIC_MESSAGES.find(x=>x.id==='case_update')?.requiresReview);
assert.ok(HELENA_AUTOMATIC_MESSAGES.find(x=>x.id==='documents_received')?.template.includes('não significa'));
console.log('Helena: 36 message templates validated. No sends executed.');
