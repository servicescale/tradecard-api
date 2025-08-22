const test = require('node:test');
const assert = require('node:assert');
const { inferTradecard } = require('../lib/infer');
const mockFetch = require('./helpers/mockFetch');
const resetEnv = require('./helpers/resetEnv');

test('inferTradecard tolerates fenced JSON and filters fields', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': {
      json: {
        choices: [
          {
            message: {
              content:
                '```json\n{"business":{"description":"desc"},"services":{"list":["a"]},"extra":1}\n```'
            }
          }
        ]
      }
    }
  });
  const out = await inferTradecard({ business: { name: 'x' } });
  restore();
  const { _meta, ...data } = out;
  assert.deepEqual(data, {
    business: { description: { value: 'desc', confidence: 0.5 } },
    services: { list: { value: ['a'], confidence: 0.5 } }
  });
  assert.deepEqual(_meta, { ok: true });
});

test('inferTradecard reports invalid JSON in _meta', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': {
      json: { choices: [{ message: { content: 'not json' } }] }
    }
  });
  const out = await inferTradecard({});
  restore();
  assert.equal(out._meta.error, 'invalid_json');
});

test('inferTradecard skips without API key', async () => {
  resetEnv({});
  const out = await inferTradecard({});
  assert.deepEqual(out, { _meta: { skipped: 'no_api_key' } });
});
