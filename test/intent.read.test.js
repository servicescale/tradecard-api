const test = require('node:test');
const assert = require('node:assert');
const { acfContract } = require('../lib/acf_contract');

test('acf contract includes core fields', () => {
  assert.ok(acfContract.includes('identity_business_name'));
  assert.ok(acfContract.includes('service_1_title'));
});
