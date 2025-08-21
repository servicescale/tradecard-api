const test = require('node:test');
const assert = require('assert');
const { parse } = require('../lib/parse');

test('parse extracts data from simple html', async () => {
  const html = `<!DOCTYPE html>
  <html><head><title>Test Page</title></head>
  <body>
    <h1>Welcome</h1>
    <h2>About</h2>
    <img src="/img/logo.png" />
    <a href="mailto:test@example.com">Email</a>
    <a href="https://twitter.com/test">Twitter</a>
  </body></html>`;

  const page = await parse(html, 'https://example.com');

  assert.strictEqual(page.title, 'Test Page');
  assert.deepStrictEqual(page.headings.h1, ['Welcome']);
  assert(page.images.includes('https://example.com/img/logo.png'));
  assert.deepStrictEqual(page.contacts.emails, ['test@example.com']);
  assert.deepStrictEqual(page.social, [
    { platform: 'twitter', url: 'https://twitter.com/test' }
  ]);
});
