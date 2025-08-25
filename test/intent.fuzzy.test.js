const test = require('node:test');
const assert = require('node:assert');
const { helpers } = require('../lib/intent');

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
