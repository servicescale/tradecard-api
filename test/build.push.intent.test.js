const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const mockFetch = require('./helpers/mockFetch');

const { acfSync } = require('../lib/wp');

test('applyIntent push increases sent_keys and audit ok', async () => {
  const yaml = `
name:
  source: business.name
phone:
  source: contacts.phone
  transforms: digits
`;
  const tmp = path.join(__dirname, 'intent.push.yaml');
  fs.writeFileSync(tmp, yaml);
  delete require.cache[require.resolve('../lib/intent')];
  const { loadIntent, applyIntent } = require('../lib/intent');
  loadIntent(tmp);

  const tc = { business: { name: 'Biz' }, contacts: { phone: '123 456' } };
  const intent = await applyIntent(tc);
  const baseline = 1;
  assert.ok(intent.sent_keys.length > baseline);
  assert.ok(intent.audit.every(a => a.status === 'ok'));

  const restore = mockFetch({
    'http://wp/wp-json/custom/v1/acf-sync/1': { json: { ok: true } },
  });
  const resp = await acfSync('http://wp', 't', 1, intent.fields);
  restore();
  assert.equal(resp.ok, true);

  fs.unlinkSync(tmp);
  delete require.cache[require.resolve('../lib/intent')];
});
