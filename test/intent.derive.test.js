const test = require('node:test');
const assert = require('node:assert');
const { applyIntent } = require('../lib/intent');

test('applyIntent merges derived identity, social, and trust fields', async () => {
  const tradecard = { slug: 'https://tradecard.au/acme' };
  const raw = {
    identity_abn: '123',
    identity_owner_name: 'John Doe',
    identity_phone: '+61123456789',
    identity_address: '1 Main St',
    social: [
      { platform: 'facebook', url: 'http://facebook.com/Acme?fbclid=1' }
    ],
    gmb_lookup: {
      social_links_twitter: 'https://twitter.com/Acme?utm_source=1'
    }
  };
  const { fields } = await applyIntent(tradecard, { raw });
  assert.equal(fields.identity_display_name, 'John Doe');
  assert.equal(fields.identity_verified, 'true');
  assert.equal(fields.identity_address_uri, 'https://www.google.com/maps/search/?api=1&query=1%20Main%20St');
  assert.equal(fields.social_links_facebook, 'https://facebook.com/acme');
  assert.equal(fields.social_links_twitter, 'https://twitter.com/acme');
  assert.equal(fields.trust_qr_text, 'https://tradecard.au/acme');
  assert.equal(fields.trust_vcf_url, 'https://contact.tradecard.au/acme.vcf');
});
