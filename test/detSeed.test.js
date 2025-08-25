const test = require('node:test');
const assert = require('node:assert');
const { helpers } = require('../lib/intent');

test('detSeed copies identity fields, normalizes phone, validates images', () => {
  const raw = {
    identity_owner_name: '  Jane Smith ',
    identity_role_title: 'Owner',
    identity_headshot_url: 'http://example.com/head.jpg',
    identity_suburb: ' Sydney ',
    identity_state: ' NSW ',
    identity_abn: '12345678901',
    identity_insured: 'Fully insured',
    identity_phone: '02 1234 5678',
    identity_email: 'User@Example.com',
    identity_logo_url: 'javascript:bad',
    anchors: []
  };
  const result = helpers.detSeed({ raw });
  assert.equal(result.identity_owner_name, 'Jane Smith');
  assert.equal(result.identity_role_title, 'Owner');
  assert.equal(result.identity_headshot_url, 'http://example.com/head.jpg');
  assert.equal(result.identity_suburb, 'Sydney');
  assert.equal(result.identity_state, 'NSW');
  assert.equal(result.identity_abn, '12345678901');
  assert.equal(result.identity_insured, 'Fully insured');
  assert.equal(result.identity_phone, '+61212345678');
  assert.equal(result.identity_email, 'user@example.com');
  assert.ok(!result.identity_logo_url);
});

test('detSeed rejects invalid headshot url', () => {
  const raw = { identity_headshot_url: 'javascript:bad' };
  const result = helpers.detSeed({ raw });
  assert.ok(!result.identity_headshot_url);
});
