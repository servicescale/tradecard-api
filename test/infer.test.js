const test = require('node:test');
const assert = require('node:assert');
const { inferTradecard } = require('../lib/infer');
const mockFetch = require('./helpers/mockFetch');
const resetEnv = require('./helpers/resetEnv');

test('inferTradecard returns whitelisted fields', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': {
      json: { choices: [{ message: { content: '{"business":{"description":"desc"},"services":{"list":["a"]},"extra":1}' } }] }
    }
  });
  const out = await inferTradecard({ business: { name: 'x' } });
  restore();
  assert.deepEqual(out, { business: { description: 'desc' }, services: { list: ['a'] } });
});

test('inferTradecard reports errors in _meta', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': { status: 500, json: { error: 'bad' } }
  });
  const out = await inferTradecard({});
  restore();
  assert.ok(out._meta);
  assert.equal(out._meta.status, 500);
});
