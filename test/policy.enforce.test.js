const test = require('node:test');
const assert = require('node:assert');
const { enforcePolicy } = require('../lib/policy');

test('enforcePolicy keeps values that match constraints', () => {
  const map = {
    headline: { constraints: { min_len: 5, max_len: 20 } },
    tone: { constraints: { allowed_values: ['friendly', 'formal'] } },
    slug: { constraints: { regex: '^[a-z0-9-]+$' } }
  };
  const input = { headline: 'Hello world', tone: 'friendly', slug: 'pool-boys' };
  const { clean, rejected } = enforcePolicy(input, map);

  assert.deepEqual(clean, input);
  assert.deepEqual(rejected, []);
});

test('enforcePolicy nulls values that violate constraints', () => {
  const map = {
    headline: { constraints: { min_len: 5, max_len: 10 } },
    tone: { constraints: { allowed_values: ['friendly', 'formal'] } },
    slug: { constraints: { regex: '^[a-z0-9-]+$' } },
    blurb: { constraints: { min_words: 2, max_words: 3 } }
  };
  const input = {
    headline: 'This headline is too long',
    tone: 'casual',
    slug: 'Pool Boys!',
    blurb: 'Too many words here'
  };
  const { clean, rejected } = enforcePolicy(input, map);

  assert.deepEqual(clean, {
    headline: null,
    tone: null,
    slug: null,
    blurb: null
  });
  assert.deepEqual(rejected, [
    { field: 'headline', reason: 'max_len' },
    { field: 'tone', reason: 'allowed_values' },
    { field: 'slug', reason: 'regex' },
    { field: 'blurb', reason: 'max_words' }
  ]);
});
