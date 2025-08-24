const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../lib/parse');
const { resolveIdentity } = require('../lib/resolve');

test('raw profile resolves into full identity block', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/profile.html'), 'utf8');
  const parsed = await parse(html, 'http://biz.example.com');
  Object.assign(parsed, {
    identity_logo_url: 'http://biz.example.com/logo.png',
    identity_business_type: 'Plumber',
    identity_location_label: 'Sydney NSW',
    identity_business_name: 'Jane Doe Plumbing'
  });
  const identity = resolveIdentity(parsed);

  assert.equal(identity.identity_owner_name, 'Jane Doe');
  assert.equal(identity.identity_role_title, 'Director');
  assert.equal(identity.identity_headshot_url, 'http://biz.example.com/headshot.jpg');
  assert.equal(identity.identity_suburb, 'Suburb');
  assert.equal(identity.identity_state, 'NSW');
  assert.equal(identity.identity_abn, '12345678901');
  assert.equal(identity.identity_insured, 'Fully insured for all work');
  assert.equal(identity.identity_logo_url, 'http://biz.example.com/logo.png');
  assert.equal(identity.identity_business_type, 'Plumber');
  assert.equal(identity.identity_location_label, 'Sydney NSW');
  assert.equal(identity.identity_business_name, 'Jane Doe Plumbing');
  assert.equal(identity.identity_address, '123 Street, Suburb, NSW 2000');
  assert.equal(identity.identity_email, 'jane@example.com');
  assert.equal(identity.identity_phone, '+610212345678');
  assert.equal(
    identity.identity_services,
    '<div class="tag">Plumbing</div><div class="tag">Gas Fitting</div>'
  );
  assert.equal(identity.identity_website, 'biz.example.com');
  assert.equal(identity.identity_website_url, 'http://biz.example.com/');
  assert.ok(identity.identity_address_uri.includes('google.com/maps'));
  assert.equal(identity.identity_uri_email, 'mailto:jane@example.com');
  assert.equal(identity.identity_uri_phone, 'tel:+610212345678');
  assert.equal(identity.identity_uri_sms, 'sms:+610212345678');
  assert.equal(identity.identity_uri_whatsapp, 'https://wa.me/610212345678');
  assert.equal(identity.identity_display_name, 'Jane Doe');
  assert.equal(identity.identity_verified, 'true');
});
