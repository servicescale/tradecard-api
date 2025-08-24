const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../lib/parse');
const { resolveServicePanels } = require('../lib/resolve');

function load(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

test('auto-fill from gallery when 1 panel', async () => {
  const html = load('service-panels-1.html');
  const page = await parse(html, 'http://example.com');
  const fields = resolveServicePanels(page);
  assert.equal(fields.service_1_price, '$100');
  assert.equal(fields.service_1_inclusion_3, 'C');
  assert.equal(fields.service_1_cta_link, 'http://example.com/buy1');
  assert.equal(fields.service_2_panel_tag, 'featured project');
  assert.equal(fields.service_3_panel_tag, 'featured project');
});

test('auto-fill adds project when 2 panels present', async () => {
  const html = load('service-panels-2.html');
  const page = await parse(html, 'http://example.com');
  const fields = resolveServicePanels(page);
  assert.equal(fields.service_2_price, '$200');
  assert.equal(fields.service_3_panel_tag, 'featured project');
});

test('no auto-fill needed for 3 panels', async () => {
  const html = load('service-panels-3.html');
  const page = await parse(html, 'http://example.com');
  const fields = resolveServicePanels(page);
  assert.equal(fields.service_3_price, '$300');
  assert.equal(fields.service_3_panel_tag, 'featured product');
});
