const test = require('node:test');
const assert = require('node:assert');
const { resolveSocialLinks } = require('../lib/resolve');

test('resolveSocialLinks merges parsed socials with gmb fallback', () => {
  const parsed = [
    { platform: 'facebook', url: 'http://facebook.com/Acme?utm_source=fb&fbclid=123' },
    { platform: 'instagram', url: 'https://instagram.com/acme' },
    { platform: 'youtube', url: 'https://youtu.be/ABC' }
  ];
  const gmb = {
    social_links_twitter: 'https://twitter.com/acme',
    social_links_linkedin: 'https://linkedin.com/company/acme',
    social_links_pinterest: 'https://pinterest.com/acme',
    social_links_tiktok: 'https://tiktok.com/@acme'
  };
  const res = resolveSocialLinks(parsed, gmb);
  assert.deepEqual(res, {
    social_links_facebook: 'https://facebook.com/acme',
    social_links_instagram: 'https://instagram.com/acme',
    social_links_youtube: 'https://youtu.be/abc',
    social_links_twitter: 'https://twitter.com/acme',
    social_links_linkedin: 'https://linkedin.com/company/acme',
    social_links_pinterest: 'https://pinterest.com/acme',
    social_links_tiktok: 'https://tiktok.com/@acme'
  });
});
