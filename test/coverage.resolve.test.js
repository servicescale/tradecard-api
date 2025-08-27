const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('metadata pass captures basic fields and notes unresolved', () => {
  const { resolvePasses } = require('../lib/resolve');
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/apply-intent.raw.json'), 'utf8'));
  const allow = [
    'identity_owner_name',
    'identity_website_url',
    'identity_logo_url',
    'identity_email',
    'identity_phone',
    'social_links_facebook'
  ];
  const { trace } = resolvePasses(raw, allow);
  const meta = trace[0];
  assert.equal(meta.stage, 'metadata');
  assert.deepEqual(meta.unresolved.sort(), ['identity_email', 'identity_phone', 'social_links_facebook'].sort());
  assert.equal(meta.coverage, 0.5);
});

test('entities pass resolves contact fields and narrows unresolved set', () => {
  const { resolvePasses } = require('../lib/resolve');
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/apply-intent.raw.json'), 'utf8'));
  const allow = [
    'identity_owner_name',
    'identity_website_url',
    'identity_logo_url',
    'identity_email',
    'identity_phone',
    'social_links_facebook'
  ];
  const { fields, trace } = resolvePasses(raw, allow);
  const entities = trace[1];
  assert.equal(entities.stage, 'entities');
  assert.equal(fields.identity_email, 'info@biz.example.com');
  assert.equal(fields.identity_phone, '+61212345678');
  assert.deepEqual(entities.unresolved, ['social_links_facebook']);
  assert.ok(entities.coverage > trace[0].coverage);
});

test('relationships pass completes social links and achieves full coverage', () => {
  const { resolvePasses } = require('../lib/resolve');
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/apply-intent.raw.json'), 'utf8'));
  const allow = [
    'identity_owner_name',
    'identity_website_url',
    'identity_logo_url',
    'identity_email',
    'identity_phone',
    'social_links_facebook'
  ];
  const { fields, trace } = resolvePasses(raw, allow);
  const rel = trace[2];
  assert.equal(rel.stage, 'relationships');
  assert.equal(fields.social_links_facebook, 'https://facebook.com/biz');
  assert.equal(rel.unresolved.length, 0);
  assert.ok(rel.coverage > trace[1].coverage);
  assert.equal(rel.coverage, 1);
});

test('applyIntent populates identity and service fields and falls back to LLM', async () => {
  const imap = require('../lib/intent_map');
  imap.loadIntentMap = () => ({
    service_index: [1, 2, 3],
    identity_owner_name: {},
    identity_website_url: {},
    identity_logo_url: {},
    identity_email: {},
    identity_phone: {},
    service_1_title: {},
    service_2_title: {},
    service_3_panel_tag: {},
    service_1_description: { strategy: 'det_then_llm', llm: { prompt: 'Describe service one' } }
  });

  const origKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  const calls = [];
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      json: async () => ({ choices: [{ message: { content: 'Generated description' } }] })
    };
  };

  const { applyIntent } = require('../lib/intent');
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/apply-intent.raw.json'), 'utf8'));
  const { fields, trace } = await applyIntent({}, { raw });

  assert.equal(fields.identity_owner_name, 'Jane Smith');
  assert.equal(fields.identity_website_url, 'http://biz.example.com/');
  assert.equal(fields.identity_logo_url, 'http://biz.example.com/logo.png');
  assert.equal(fields.identity_email, 'info@biz.example.com');
  assert.equal(fields.identity_phone, '+61212345678');

  assert.equal(fields.service_1_title, 'Panel 1');
  assert.equal(fields.service_2_title, 'Project A');
  assert.equal(fields.service_3_panel_tag, 'featured project');
  assert.equal(fields.service_1_description, 'Generated description');

  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].opts.body);
  const payload = JSON.parse(body.messages[1].content);
  assert.ok(payload.links.some((l) => l.href === 'mailto:info@biz.example.com'));
  assert.ok(payload.images.some((i) => i.src === 'http://biz.example.com/service1.jpg'));

  const unresolved = trace.find((t) => t.stage === 'unresolved');
  assert.ok(unresolved, 'missing unresolved stage');
  assert.ok(unresolved.remaining.includes('identity_role_title'));

  global.fetch = origFetch;
  process.env.OPENAI_API_KEY = origKey;
});
