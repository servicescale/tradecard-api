const test = require('node:test');
const assert = require('node:assert');
const { getAllowKeys } = require('../lib/acf_contract');

test('acf contract includes core fields', () => {
  const keys = getAllowKeys();
  assert.ok(keys.has('identity_business_name'));
  assert.ok(keys.has('service_2_title'));
});
