const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../lib/parse');
const { buildTradecardFromPages } = require('../lib/build');
const mockFetch = require('./helpers/mockFetch');

test('buildTradecardFromPages seeds core fields and provenance', async () => {
  const restore = mockFetch({
    'http://example.com/style.css': { body: 'body{background:url("http://example.com/css.png");}' },
    'http://example.com/imported.css': { body: '' }
  });
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/simple.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  restore();

  const out = buildTradecardFromPages('http://example.com', [page]);
  assert.equal(out.tradecard.business.name, 'Simple Page');
  assert.deepEqual(out.tradecard.contacts.emails, ['info@example.com']);
  assert.ok(out.tradecard.social.find(s => s.platform === 'facebook'));
  assert.ok(out.tradecard.content.headings.every(h => h.url === 'http://example.com'));
  assert.ok(out.needs_inference.includes('business.description'));
});
