const test = require('node:test');
const assert = require('node:assert');
const { applyIntent } = require('../lib/intent');

test('applyIntent uses MVF resolver to populate uri and service areas', async () => {
  const raw = {
    anchors: [{ href: 'tel:0412 345 678' }],
    headings: ['Sydney', 'Newcastle']
  };
  const { fields, trace } = await applyIntent({}, { raw, opts: { noLLM: true } });
  assert.ok(fields.identity_uri_phone);
  assert.equal(fields.service_areas_csv, 'Sydney,Newcastle');
  const mvfTrace = trace.find((t) => t.stage === 'mvf_merge');
  assert.ok(mvfTrace);
  assert.ok(mvfTrace.supplied >= 2);
});
