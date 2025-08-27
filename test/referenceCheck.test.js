const test = require('node:test');
const assert = require('node:assert');
const { referenceCheck } = require('../lib/referenceCheck');
const { completeness } = require('../lib/completeness');

// Successful lookup should return empty error object
// Use known country code and ID

test('referenceCheck accepts known references', () => {
  const errors = referenceCheck({ country_code: 'US', id: 'ID123' });
  assert.deepStrictEqual(errors, {});
});

// Failing lookup should report both unknown values

test('referenceCheck reports unknown references', () => {
  const errors = referenceCheck({ country_code: 'ZZ', id: 'BAD' });
  assert.deepStrictEqual(errors, {
    country_code: 'Unknown country code: ZZ',
    id: 'Unknown id: BAD'
  });
});

// Integration: completeness should include reference_errors field

test('completeness exposes reference errors', () => {
  const map = { country_code: {}, id: {} };
  const result = completeness(map, { country_code: 'ZZ', id: 'ID123' });
  assert.deepStrictEqual(result.reference_errors, {
    country_code: 'Unknown country code: ZZ'
  });
});
