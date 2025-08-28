const test = require('node:test');
const assert = require('node:assert');

test('llm resolver handles structured JSON and confidence', async () => {
  const origKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  const LONG_TEXT = Array(40).fill('word').join(' ');
  const calls = [];
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const payload = JSON.parse(JSON.parse(opts.body).messages[1].content);
    calls.push(payload);
    return {
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ value: LONG_TEXT, confidence: 0.9 }) } }]
      })
    };
  };

  const { resolveField } = require('../lib/llm_resolver');
  const result = await resolveField('business_description', {}, {
    raw: {},
    unresolved: ['business_description'],
    snippet: 'sample context',
    fields: { foo: 'bar' }
  });

  assert.equal(result, LONG_TEXT);
  assert.deepStrictEqual(calls[0].unresolved_fields, ['business_description']);
  assert.equal(calls[0].context_snippet, 'sample context');
  assert.deepStrictEqual(calls[0].existing_fields, { foo: 'bar' });
  assert.ok(/business/i.test(calls[0].instructions));

  global.fetch = async () => ({
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ value: LONG_TEXT, confidence: 0.2 }) } }]
    })
  });
  const rejected = await resolveField(
    'business_description',
    { llm: { confidence_threshold: 0.5 } },
    { raw: {} }
  );
  assert.equal(rejected, '');

  global.fetch = origFetch;
  process.env.OPENAI_API_KEY = origKey;
});

