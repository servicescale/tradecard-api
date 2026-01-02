const test = require('node:test');
const assert = require('node:assert');
const { helpers } = require('../lib/intent');
const det = require('../lib/detExtractors');

test('detResolve fuzzy matches close raw keys', () => {
  const raw = { identity_ownername: 'Jane Doe' };
  const val = helpers.detResolve('identity_owner_name', {}, { raw });
  assert.equal(val, 'Jane Doe');
});

test('detResolve ignores distant keys', () => {
  const raw = { identity_email_address: 'user@example.com' };
  const val = helpers.detResolve('identity_phone', {}, { raw });
  assert.equal(val, '');
});

test('detResolve handles small typos in keys', () => {
  const raw = { identity_owner_nmae: 'Jane Doe' };
  const val = helpers.detResolve('identity_owner_name', {}, { raw });
  assert.equal(val, 'Jane Doe');
});

test('detResolve matches shorter keys when prefixes are omitted', () => {
  const raw = { phone: '+61234567890' };
  const val = helpers.detResolve('identity_phone', {}, { raw });
  assert.equal(val, '+61234567890');
});

test('detResolve matches social keys without the social_links prefix', () => {
  const raw = { facebook_url: 'https://facebook.com/example' };
  const val = helpers.detResolve('social_links_facebook', {}, { raw });
  assert.equal(val, 'https://facebook.com/example');
});

test('PHONE_RX accepts international formats', () => {
  assert(det.PHONE_RX.test('+1 (555) 123-4567'));
});
