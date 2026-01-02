const test = require('node:test');
const assert = require('node:assert');
const { inferTradecard, emptyProfile } = require('../lib/infer');
const mockFetch = require('./helpers/mockFetch');
const resetEnv = require('./helpers/resetEnv');

test('inferTradecard returns profile and evidence when stages validate', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const evidence = {
    service_evidence: [
      { phrases: ['Plumbing'], occurrences: 2, pages: ['https://example.com/services'] }
    ],
    about_evidence: ['Trusted plumbing specialists.'],
    geo_evidence: ['Sydney'],
    contact_evidence: { emails: ['info@example.com'], phones: ['+61 400 000 000'] }
  };
  const profile = {
    identity_business_name: 'Example Plumbing',
    identity_business_description: 'Plumbing services for residential properties.',
    identity_services: [{ name: 'Plumbing', description: 'General plumbing repairs.' }],
    service_areas: ['Sydney'],
    identity_value_proposition: 'Clear pricing and reliable service.'
  };
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': [
      { json: { choices: [{ message: { content: JSON.stringify(evidence) } }] } },
      { json: { choices: [{ message: { content: JSON.stringify(profile) } }] } }
    ]
  });

  const out = await inferTradecard({
    tradecard: { contacts: { website: 'https://example.com', emails: ['info@example.com'], phones: ['+61400000000'] } },
    raw: { url: 'https://example.com', headings: ['Home'], text_blocks: ['Plumbing services'], anchors: [] }
  });
  restore();

  assert.deepEqual(out.profile, profile);
  assert.deepEqual(out.evidence, evidence);
  assert.equal(out._meta.ok, true);
});

test('inferTradecard discards invalid evidence', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': {
      json: { choices: [{ message: { content: '{"about_evidence":[]}' } }] }
    }
  });

  const out = await inferTradecard({ tradecard: {}, raw: {} });
  restore();

  assert.deepEqual(out.profile, emptyProfile());
  assert.equal(out._meta.error, 'invalid_evidence');
});

test('inferTradecard discards invalid profile', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const evidence = {
    service_evidence: [],
    about_evidence: [],
    geo_evidence: [],
    contact_evidence: { emails: [], phones: [] }
  };
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': [
      { json: { choices: [{ message: { content: JSON.stringify(evidence) } }] } },
      { json: { choices: [{ message: { content: '{"identity_business_name":"x"}' } }] } }
    ]
  });

  const out = await inferTradecard({ tradecard: {}, raw: {} });
  restore();

  assert.deepEqual(out.profile, emptyProfile());
  assert.equal(out._meta.error, 'invalid_profile');
});

test('inferTradecard skips without API key', async () => {
  resetEnv({});
  const out = await inferTradecard({ tradecard: {}, raw: {} });
  assert.deepEqual(out, { profile: emptyProfile(), evidence: null, _meta: { skipped: 'no_api_key' } });
});
