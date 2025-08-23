const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('intent reader supports paths, fallbacks, transforms and constraints', async () => {
  const yaml = `
name:
  source: business.name
  transforms: trim
first_email:
  source: contacts.emails[0]
  transforms: [trim, lower]
instagram:
  source: social[platform=instagram].url
  transforms: trim
alt_phone:
  source:
    - contacts.phone
    - contacts.alt_phone
  transforms: digits
emails_csv:
  source: contacts.emails
  transforms: csv
short_desc:
  source: business.short
  constraints:
    min_length: 5
title:
  source: business.title
  constraints:
    no_generic_terms: true
`;
  const tmp = path.join(__dirname, 'intent.temp.yaml');
  fs.writeFileSync(tmp, yaml);
  delete require.cache[require.resolve('../lib/intent')];
  const { loadIntent, applyIntent } = require('../lib/intent');
  loadIntent(tmp);

  const tc = {
    business: { name: ' My Biz ', short: 'abc', title: 'Owner' },
    contacts: { emails: [' INFO@Example.com ', 'Sales@Example.com'], alt_phone: '123 456' },
    social: [
      { platform: 'instagram', url: ' http://insta ' },
      { platform: 'facebook', url: 'http://fb' },
    ],
  };

  const out = await applyIntent(tc);

  fs.unlinkSync(tmp);
  delete require.cache[require.resolve('../lib/intent')];

  assert.equal(out.fields.name, 'My Biz');
  assert.equal(out.fields.first_email, 'info@example.com');
  assert.equal(out.fields.instagram, 'http://insta');
  assert.equal(out.fields.alt_phone, '123456');
  assert.equal(out.fields.emails_csv, 'INFO@Example.com,Sales@Example.com');
  assert.ok(!('short_desc' in out.fields));
  assert.ok(!('title' in out.fields));

  const status = Object.fromEntries(out.audit.map(a => [a.key, a.status]));
  assert.equal(status.name, 'ok');
  assert.equal(status.first_email, 'ok');
  assert.equal(status.instagram, 'ok');
  assert.equal(status.alt_phone, 'ok');
  assert.equal(status.emails_csv, 'ok');
  assert.equal(status.short_desc, 'invalid');
  assert.equal(status.title, 'invalid');
});
