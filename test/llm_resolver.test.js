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
    raw: {},
    hints: {},
    allowKeys: new Set(['identity_business_name', 'identity_phone'])
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

test('resolveWithLLM targets missing keys', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  let body;
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': (url, opts) => {
      body = JSON.parse(opts.body);
      return { json: { choices: [{ message: { content: '{}' } }] } };
    }
  });

  await resolveWithLLM({
    raw: {},
    hints: { identity_business_name: 'Biz' },
    allowKeys: new Set(['identity_business_name', 'service_2_title'])
  });
  const user = JSON.parse(body.messages[1].content);
  restore();
  assert.deepEqual(user.targets, ['service_2_title']);
});


test('resolveWithLLM includes extra raw fields in pruned payload', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  let body;
  const raw = {
    text_blocks: ['a', 'b'],
    profile_videos: ['v1'],
    contact_form_links: ['f1'],
    awards: [{ text: 'Best', href: 'https://a.example' }],
    social: [{ platform: 'facebook', url: 'https://fb.com/x' }],
    contacts: { emails: ['e@x.com'], phones: ['123'] }
  };

  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': (url, opts) => {
      body = JSON.parse(opts.body);
      return { json: { choices: [{ message: { content: '{}' } }] } };
    }
  });

  await resolveWithLLM({
    raw: {},
    hints: {},
    context: { business_name: 'Ctx Biz' },
    allowKeys: new Set(['identity_business_name'])
  });
  const user = JSON.parse(body.messages[1].content);
  assert.equal(user.context.business_name, 'Ctx Biz');
  await resolveWithLLM({ raw, allowKeys: new Set(['some']) });
  const pruned = JSON.parse(body.messages[1].content).raw_pruned;
  restore();
  assert.deepEqual(pruned.text_blocks, ['a', 'b']);
  assert.deepEqual(pruned.profile_videos, ['v1']);
  assert.deepEqual(pruned.contact_form_links, ['f1']);
  assert.deepEqual(pruned.awards, [{ text: 'Best', href: 'https://a.example' }]);
  assert.deepEqual(pruned.social, [
    { platform: 'facebook', url: 'https://fb.com/x' }
  ]);
  assert.deepEqual(pruned.contacts, {
    emails: ['e@x.com'],
    phones: ['123']
  });
});
