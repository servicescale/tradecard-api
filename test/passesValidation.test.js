const test = require('node:test');
const assert = require('node:assert');

const { passesValidation } = require('../lib/intent');

test('passesValidation enforces min_words', () => {
  const rule = { llm: { validate: { min_words: 5 } } };
  assert.strictEqual(passesValidation('one two three', rule), false);
  assert.strictEqual(passesValidation('one two three four five', rule), true);
});

