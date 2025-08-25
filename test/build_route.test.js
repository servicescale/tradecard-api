const test = require('node:test');
const assert = require('node:assert');
const mockFetch = require('./helpers/mockFetch');
const resetEnv = require('./helpers/resetEnv');
const buildLib = require('../lib/build');

test('build route performs crawl, intent resolve, push', async () => {
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
      {
        json: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  business: { description: 'Inferred Desc' },
                  services: { list: ['Inferred Service'] },
                  service_areas: ['Area1'],
                  brand: { tone: 'Friendly' },
                  testimonials: [{ quote: 'Great', reviewer: 'Ann' }]
                })
              }
            }
          ]
        }
      },
      {
        json: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  identity_business_name: 'Biz',
                  identity_owner_name: 'Ann',
                  identity_role_title: 'Owner',
                  identity_state: 'NSW',
                  identity_business_type: 'Plumber',
                  identity_email: 'a@b.com',
                  identity_phone: '123',
                  identity_website: 'http://site.test',
                  identity_location_label: 'Sydney',
                  business_description: 'Desc',
                  service_2_title: 'S1',
                  service_2_description: 'D1',
                  service_2_image_url: 'i1',
                  service_areas_csv: 'A',
                  social_links_facebook: 'fb'
                })
              }
            }
          ]
        }
      }
    ],
    'http://wp/wp-json/': { json: { routes: { '/custom/v1/acf-sync/(?P<id>\\d+)': { methods: ['POST'] } } } },
    'http://wp/wp-json/wp/v2/tradecard': { json: { id: 1 } },
    'http://wp/wp-json/tradecard/v1/upload-image-from-url': { json: { url: 'http://wp/up.png' } },
    'http://wp/wp-json/custom/v1/acf-sync/1': { json: { ok: true } }
  });

  const handler = require('../api/build');
  const req = { query: { url: 'http://site.test', push: '1', debug: '1', maxPages: '1', maxDepth: '0' } };
  const res = { status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; } };
  await handler(req, res);
  restore();

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.wordpress.ok);
  assert.ok(res.body.debug.trace.find(t => t.stage === 'crawl'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'infer'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'intent_input'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'det_resolve'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'llm_resolve'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'intent_coverage'));
  assert.ok(res.body.debug.trace.find(t => t.stage === 'push' && t.step === 'acf_sync'));
  const steps = res.body.wordpress.details.steps;
  assert.deepEqual(steps.map(s => s.step), ['create','upload_logo','upload_hero','upload_image','upload_image','acf_sync']);
  assert.ok(steps[0].response.ok);
  const acf_step = steps.find(s => s.step === 'acf_sync');
  assert.equal(acf_step.response.status, 200);
  assert.ok(Array.isArray(res.body.wordpress.details.acf_keys));
  assert.ok(res.body.wordpress.details.acf_keys.length >= 1);
  assert.equal(res.body.tradecard.business.description.value, 'Inferred Desc');
  assert.deepEqual(res.body.tradecard.services.list.value, ['Inferred Service']);
});
