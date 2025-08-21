const test = require('node:test');
const assert = require('node:assert');
const { createPost, uploadFromUrl, acfSync } = require('../lib/wp');
const mockFetch = require('./helpers/mockFetch');

test('wp helpers handle success and error paths', async () => {
  let restore = mockFetch({
    'http://wp/wp-json/wp/v2/tradecard': { json: { id: 1 } },
    'http://wp/wp-json/tradecard/v1/upload-image-from-url': { json: { url: 'http://wp/img.jpg' } },
    'http://wp/wp-json/custom/v1/acf-sync/1': { json: { ok: true } }
  });
  const base = 'http://wp';
  const token = 't';
  const created = await createPost(base, token, { title: 't' });
  const uploaded = await uploadFromUrl(base, token, 'http://img');
  const acfed = await acfSync(base, token, 1, { a: 1 });
  restore();
  assert.equal(created.ok, true);
  assert.equal(uploaded.ok, true);
  assert.equal(acfed.ok, true);

  restore = mockFetch({
    'http://wp/wp-json/wp/v2/tradecard': { status: 500, body: 'err' }
  });
  const fail = await createPost(base, token, { title: 't' });
  restore();
  assert.equal(fail.ok, false);
  assert.equal(fail.status, 500);
});
