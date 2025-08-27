const test = require('node:test');
const assert = require('node:assert');
const { resolveMVF } = require('../lib/mvf_resolver');

test('theme_primary_color from meta tag', async () => {
  const { fields } = await resolveMVF({
    raw: { meta_theme_color: '#112233' },
    allowKeys: new Set(['theme_primary_color'])
  });
  assert.equal(fields.theme_primary_color, '#112233');
});

test('theme_primary_color from CSS variables', async () => {
  const { fields } = await resolveMVF({
    raw: { css_variables: { 'primary-color': '#aabbcc' } },
    allowKeys: new Set(['theme_primary_color'])
  });
  assert.equal(fields.theme_primary_color, '#aabbcc');
});
