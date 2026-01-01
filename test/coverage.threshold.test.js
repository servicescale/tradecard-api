const test = require('node:test');
const assert = require('node:assert');
const { resolveGate } = require('../lib/gates.js');

test('resolveGate fails when coverage is below threshold', () => {
  const out = resolveGate({ coverage: 0.49, requiredPresent: true, threshold: 0.5 });
  assert.deepEqual(out, { pass: false, reason: 'insufficient_coverage' });
});

test('resolveGate passes when coverage meets threshold', () => {
  const out = resolveGate({ coverage: 0.51, requiredPresent: true, threshold: 0.5 });
  assert.deepEqual(out, { pass: true });
});
