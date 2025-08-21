const test = require('node:test');
const assert = require('node:assert');
const mockFetch = require('./helpers/mockFetch');
const resetEnv = require('./helpers/resetEnv');
const buildLib = require('../lib/build');

test('build route performs crawl, inference, push', async () => {
  buildLib.crawlSite = async () => [{
    url: 'http://site.test',
    title: 'Site Title',
    images: ['http://site.test/logo.png', 'http://site.test/hero.png'],
    links: [],
    social: [],
    contacts: { emails: ['a@b.com'], phones: [] },
    headings: { h1: ['Hello'], h2: [], h3: [] }
  }];

  resetEnv({ OPENAI_API_KEY: 'k', WP_BASE: 'http://wp', WP_BEARER: 't' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': {
      json: { choices: [{ message: { content: '{"business":{"description":"d"},"services":{"list":["s"]}}' } }] }
    },
    'http://wp/wp-json/wp/v2/tradecard': { json: { id: 1 } },
    'http://wp/wp-json/tradecard/v1/upload-image-from-url': { json: { url: 'http://wp/up.png' } },
    'http://wp/wp-json/custom/v1/acf-sync/1': { json: { ok: true } }
  });

  const handler = require('../api/build');
  const req = { query: { url: 'http://site.test', infer: '1', push: '1', debug: '1', maxPages: '1', maxDepth: '0' } };
  const res = { status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; } };
  await handler(req, res);
  restore();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.tradecard.business.description, 'd');
  assert.deepEqual(res.body.tradecard.services.list, ['s']);
  assert.ok(res.body.wordpress.ok);
  assert.ok(!res.body.needs_inference.includes('business.description'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'crawl'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'infer_merge'));
});
