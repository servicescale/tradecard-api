const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mockFetch = require('./helpers/mockFetch');

const { acfSync } = require('../lib/wp');

test('applyIntent default sources send identity fields', async () => {
  const yaml = `
allow:
  - identity_business_name
  - identity_website_url
  - service_1_title
  - service_1_image_url
  - service_1_inclusion_1
`;
  const tmp = path.join(__dirname, 'intent.push.yaml');
  fs.writeFileSync(tmp, yaml);
  delete require.cache[require.resolve('../lib/intent')];
  const { loadIntent, applyIntent } = require('../lib/intent');
  loadIntent(tmp);

  const tc = {
    business: { name: 'Biz' },
    contacts: { website: 'http://example.com' },
    services: { list: [ { title: 'S1', image: 'img1', inclusions: ['inc1'] } ] }
  };

  const intent = await applyIntent(tc);

  assert.ok(intent.sent_keys.includes('identity_business_name'));
  assert.ok(intent.sent_keys.includes('identity_website_url'));
  assert.ok(intent.sent_keys.includes('service_1_title'));
  assert.ok(intent.sent_keys.includes('service_1_image_url'));
  assert.ok(intent.sent_keys.includes('service_1_inclusion_1'));
  assert.equal(intent.fields.service_1_title, 'S1');
  assert.equal(intent.fields.service_1_image_url, 'img1');
  assert.equal(intent.fields.service_1_inclusion_1, 'inc1');

  const cov = intent.trace.find(t => t.stage === 'intent_coverage');
  assert.equal(cov.before, 5);
  assert.equal(cov.after, 5);

  const restore = mockFetch({
    'http://wp/wp-json/custom/v1/acf-sync/1': { json: { ok: true } },
  });
  const resp = await acfSync('http://wp', 't', 1, intent.fields);
  restore();
  assert.equal(resp.ok, true);

  fs.unlinkSync(tmp);
  delete require.cache[require.resolve('../lib/intent')];
});

