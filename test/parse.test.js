const test = require('node:test');
const assert = require('assert');
const { parse } = require('../lib/parse');

test('parse extracts title, headings, images, socials and contacts', async () => {
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <title>Test Page</title>
      <meta property="og:image" content="https://example.com/og.png" />
      <style>.hero{background:url('/images/bg.jpg')}</style>
    </head>
    <body>
      <h1>Main Title</h1>
      <h2>Subheading</h2>
      <h3>Another</h3>
      <img src="/img/logo.png" srcset="/img/logo.png 1x, /img/logo@2x.png 2x" />
      <div style="background-image:url('/img/bg-inline.jpg')"></div>
      <a href="mailto:test@example.com">Email</a>
      <a href="tel:12345">Call</a>
      <a href="https://twitter.com/test">Twitter</a>
      <a href="https://facebook.com/test">Facebook</a>
    </body>
  </html>`;

  const page = await parse(html, 'https://example.com');

  assert.strictEqual(page.title, 'Test Page');
  assert.deepStrictEqual(page.headings, {
    h1: ['Main Title'],
    h2: ['Subheading'],
    h3: ['Another']
  });

  const imgs = page.images.sort();
  assert(imgs.includes('https://example.com/img/logo.png'));
  assert(imgs.includes('https://example.com/img/logo@2x.png'));
  assert(imgs.includes('https://example.com/images/bg.jpg'));
  assert(imgs.includes('https://example.com/img/bg-inline.jpg'));
  assert(imgs.includes('https://example.com/og.png'));

  assert.deepStrictEqual(page.contacts, {
    emails: ['test@example.com'],
    phones: ['12345']
  });

  assert.deepStrictEqual(page.social.sort((a,b)=>a.platform.localeCompare(b.platform)), [
    { platform: 'facebook', url: 'https://facebook.com/test' },
    { platform: 'twitter', url: 'https://twitter.com/test' }
  ]);
});
