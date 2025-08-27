const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('applyIntent uses default LLM prompts for description fields', async () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/apply-intent.raw.json'), 'utf8'));

  const origKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  const calls = [];
  const LONG_TEXT = Array(40).fill('word').join(' ');
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const payload = JSON.parse(JSON.parse(opts.body).messages[1].content);
    calls.push(payload.instructions);
    return { json: async () => ({ choices: [{ message: { content: LONG_TEXT } }] }) };
  };

  const { applyIntent } = require('../lib/intent');
  const { fields } = await applyIntent({}, { raw });

  assert.equal(fields.business_description, LONG_TEXT);
  assert.equal(fields.service_1_description, LONG_TEXT);
  assert.ok(calls.some((i) => /business/i.test(i)));
  assert.ok(calls.some((i) => /service 1/i.test(i)));

  global.fetch = origFetch;
  process.env.OPENAI_API_KEY = origKey;
});

