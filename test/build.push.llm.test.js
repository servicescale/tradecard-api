const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mockFetch = require('./helpers/mockFetch');
const { acfSync } = require('../lib/wp');
const resetEnv = require('./helpers/resetEnv');

test('LLM resolve still sends identity fields', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const yaml = `
allow:
  - identity_business_name
  - identity_website_url
  - business_description
`;
  const tmp = path.join(__dirname, 'intent.llm.yaml');
  fs.writeFileSync(tmp, yaml);
  delete require.cache[require.resolve('../lib/intent')];
  const { loadIntent, applyIntent } = require('../lib/intent');
  loadIntent(tmp);

  const tc = {
    business: { name: 'Biz' },
    contacts: { website: 'http://example.com' }
  };

  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': {
      json: {
        choices: [
          { message: { content: '{"business_description":"Great"}' } }
        ]
      }
    },
    'http://wp/wp-json/custom/v1/acf-sync/1': { json: { ok: true } }
  });

  const intent = await applyIntent(tc, { resolve: 'llm' });

  assert.ok(intent.sent_keys.includes('identity_business_name'));
  assert.ok(intent.sent_keys.includes('identity_website_url'));
  assert.equal(intent.fields.business_description, 'Great');

  const resp = await acfSync('http://wp', 't', 1, intent.fields);
  restore();
  assert.equal(resp.ok, true);

  fs.unlinkSync(tmp);
  delete require.cache[require.resolve('../lib/intent')];
});
