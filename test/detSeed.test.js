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

test('detSeed extracts address from Google Maps anchor', () => {
  const raw = {
    anchors: [
      {
        href: 'https://www.google.com/maps/place/123+Main+St,+Sydney+NSW',
        text: '123 Main St, Sydney NSW'
      }
    ]
  };
  const result = helpers.detSeed({ raw });
  assert.equal(
    result.identity_address_uri,
    'https://www.google.com/maps/place/123+Main+St,+Sydney+NSW'
  );
  assert.equal(result.identity_address, '123 Main St, Sydney NSW');
});

test('detSeed extracts address from Google Maps text block', () => {
  const raw = {
    text_blocks: [
      'Find us at https://maps.google.com/?q=456+High+St+Melbourne+VIC'
    ]
  };
  const result = helpers.detSeed({ raw });
  assert.equal(
    result.identity_address_uri,
    'https://maps.google.com/?q=456+High+St+Melbourne+VIC'
  );
  assert.equal(result.identity_address, '456 High St Melbourne VIC');
});

test('detSeed extracts contact URIs', () => {
  const raw = {
    anchors: [
      { href: 'mailto:info@example.com' },
      { href: 'sms:+61412345678' }
    ],
    text_blocks: ['Reach us on WhatsApp: https://wa.me/61412345678']
  };
  const result = helpers.detSeed({ raw });
  assert.equal(result.identity_uri_email, 'mailto:info@example.com');
  assert.equal(result.identity_uri_whatsapp, 'https://wa.me/61412345678');
  assert.equal(result.identity_uri_sms, 'sms:+61412345678');
});

test('detSeed aggregates service areas from headings and links', () => {
  const raw = {
    headings: [{ text: 'Sydney and Newcastle' }],
    anchors: [{ href: '#', text: 'Wollongong' }]
  };
  const result = helpers.detSeed({ raw });
  const areas = result.service_areas_csv.split(',');
  assert.ok(areas.includes('Sydney'));
  assert.ok(areas.includes('Newcastle'));
  assert.ok(areas.includes('Wollongong'));
});
