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
    links: ['mailto:a@b.com','tel:123'],
    social: [],
    contacts: { emails: ['a@b.com'], phones: ['123'] },
    headings: { h1: ['Hello'], h2: [], h3: [] }
  }];

  resetEnv({ OPENAI_API_KEY: 'k', WP_BASE: 'http://wp', WP_BEARER: 't' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': [
      { json: { choices: [ { message: { content: '{"business":{"description":{"value":"d","confidence":0.9}},"services":{"list":{"value":["s"],"confidence":0.8}}}' } } ] } },
      { json: { choices: [ { message: { content: JSON.stringify({
        identity_business_name: 'Biz',
        identity_website_url: 'http://site.test',
        identity_email: 'a@b.com',
        identity_phone: '123',
        business_description: 'Desc',
        service_1_title: 'S1',
        service_1_description: 'D1',
        service_1_image_url: 'i1',
        service_areas_csv: 'A',
        social_links_facebook: 'fb'
      }) } } ] } }
    ],
    'http://wp/wp-json/': { json: { routes: { '/custom/v1/acf-sync/(?P<id>\\d+)': { methods: ['POST'] } } } },
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
  assert.ok(res.body.debug.trace.find(t => t.stage === 'infer_response'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'infer_merge'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'push' && t.step === 'acf_sync'));
  const steps = res.body.wordpress.details.steps;
  assert.deepEqual(steps.map(s => s.step), ['create','upload_logo','upload_hero','upload_image','upload_image','acf_sync']);
  assert.ok(steps[0].response.ok);
  const acf_step = steps.find(s => s.step === 'acf_sync');
  assert.equal(acf_step.response.status, 200);
});
