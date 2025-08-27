const test = require('node:test');
const assert = require('node:assert');
const { cleanSocialUrl } = require('../lib/resolve');

test('cleanSocialUrl canonicalizes social URLs', () => {
  const cases = [
    ['https://m.facebook.com/Acme/?ref=bookmarks&lang=en', 'facebook', 'https://facebook.com/acme'],
    ['https://mobile.twitter.com/Acme/?utm_source=x&ref_src=twsrc%5Etfw', 'twitter', 'https://twitter.com/acme'],
    ['https://www.instagram.com/Acme/?lang=en', 'instagram', 'https://instagram.com/acme'],
    ['https://m.youtube.com/channel/UC123/?lang=en', 'youtube', 'https://youtube.com/channel/uc123']
  ];
  for (const [input, platform, expected] of cases) {
    assert.equal(cleanSocialUrl(input, platform), expected);
  }
});
