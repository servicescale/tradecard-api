const test = require('node:test');
const assert = require('node:assert');
const { similar, pickBest } = require('../lib/resolve');

test('similar matches short strings', () => {
  assert.equal(similar('id', 'id'), 1);
  assert.ok(similar('id', 'name') < 1);
});

test('similar handles small typos', () => {
  assert.ok(similar('onwer', 'owner') > 0.5);
});

test('pickBest returns high confidence for exact match', () => {
  const candidates = { id: { value: '123' }, name: { value: 'Alice' } };
  const out = pickBest(candidates, 'id');
  assert.equal(out.value, '123');
  assert.equal(out.matched, 'id');
  assert.equal(out.confidence, 1);
});
