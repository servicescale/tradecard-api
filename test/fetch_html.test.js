const test = require('node:test');
const assert = require('assert');
const { fetchHtml } = require('../lib/fetch_html');

test('fetchHtml rejects invalid URL', async () => {
  await assert.rejects(() => fetchHtml('not a url'), /Invalid URL/);
});

test('fetchHtml rejects non-http protocols', async () => {
  await assert.rejects(() => fetchHtml('ftp://example.com'), /http/);
});
