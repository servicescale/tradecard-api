const test = require('node:test');
const assert = require('node:assert');
const { _needsRendering } = require('../lib/fetch_html');

test('needsRendering flags empty bodies', () => {
  const html = '<html><body></body></html>';
  assert.strictEqual(_needsRendering(html), true);
});

test('needsRendering ignores content despite bundlers', () => {
  const content = 'Hello world '.repeat(10); // >50 chars
  const html = `<html><body><div>${content}</div><script src="/app.1234567890abcdef.js"></script></body></html>`;
  assert.strictEqual(_needsRendering(html), false);
});

test('needsRendering flags minimal text with big bundles', () => {
  const html = '<html><body><div>Hi</div><script src="/main.12345678901234567890.js"></script></body></html>';
  assert.strictEqual(_needsRendering(html), true);
});
