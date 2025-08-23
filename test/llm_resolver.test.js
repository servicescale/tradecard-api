const test = require('node:test');
const assert = require('node:assert');

const mockFetch = require('./helpers/mockFetch');
const resetEnv = require('./helpers/resetEnv');
const { resolveWithLLM } = require('../lib/llm_resolver');

test('resolveWithLLM returns allowed keys only', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': {
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                identity_business_name: 'LLM Biz',
                identity_phone: '123',
                extra: 'x'
              })
            }
          }
        ]
      }
    }
  });

  const { fields, audit } = await resolveWithLLM({
    tradecard: {},
    allowKeys: ['identity_business_name', 'identity_phone']
  });
  restore();

  assert.deepEqual(fields, {
    identity_business_name: 'LLM Biz',
    identity_phone: '123'
  });
  assert.deepEqual(audit, [
    { key: 'identity_business_name', source: 'llm' },
    { key: 'identity_phone', source: 'llm' }
  ]);
});
