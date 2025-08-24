const test = require('node:test');
const assert = require('node:assert');
const { getAllowKeys } = require('../lib/acf_contract');

test('acf contract includes core fields', async () => {
  const keys = await getAllowKeys();
  assert.ok(keys.includes('identity_business_name'));
  assert.ok(keys.includes('service_1_title'));
});
