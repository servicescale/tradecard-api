const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../lib/parse');
const { buildTradecardFromPages, collectRawFromPages } = require('../lib/build');
const { applyIntent } = require('../lib/intent');

test('known business certification.com resolves stable identity fields', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/certification.com.html'), 'utf8');
  const page = await parse(html, 'https://certification.com');
  const pages = [page];

  const result = buildTradecardFromPages('https://certification.com', pages);
  const raw = collectRawFromPages('https://certification.com', pages);
  const intent = await applyIntent(result.tradecard, { raw, opts: { noLLM: true } });

  assert.equal(intent.fields.identity_business_name, 'Paul Barry Certification');
  assert.equal(intent.fields.identity_email, 'hello@certification.com');
  assert.equal(intent.fields.identity_phone, '+61400111222');
  assert.equal(intent.fields.identity_address, '123 Main St, Sydney, NSW 2000');
  assert.equal(intent.fields.identity_website_url, 'https://certification.com/');
  assert.equal(intent.fields.service_1_title, 'Business Certification');
  assert.equal(intent.fields.service_1_price, '$199');
  assert.equal(intent.fields.service_1_cta_link, 'https://certification.com/book');
});
