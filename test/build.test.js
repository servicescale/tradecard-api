const test = require('node:test');
const assert = require('assert');
const { buildTradecardFromPages } = require('../lib/build');

test('buildTradecardFromPages assembles tradecard data', () => {
  const pages = [
    {
      url: 'https://example.com',
      title: 'Example Co - Home',
      headings: { h1: ['Welcome'], h2: [], h3: [] },
      images: [
        'https://example.com/logo.png',
        'https://example.com/hero.jpg'
      ],
      links: [],
      social: [{ platform: 'twitter', url: 'https://twitter.com/example' }],
      contacts: { emails: ['hello@example.com'], phones: ['123'] }
    }
  ];

  const result = buildTradecardFromPages('https://example.com', pages);

  assert.strictEqual(result.tradecard.business.name, 'Example Co');
  assert.deepStrictEqual(result.tradecard.contacts.emails, ['hello@example.com']);
  assert.deepStrictEqual(result.tradecard.social, [
    { platform: 'twitter', url: 'https://twitter.com/example' }
  ]);
  assert.strictEqual(result.tradecard.assets.logo, 'https://example.com/logo.png');
  assert.strictEqual(result.tradecard.assets.hero, 'https://example.com/hero.jpg');
});
