const test = require('node:test');
const assert = require('node:assert');
const { chunkText, createContext, formatPrompt, serializeFields } = require('../lib/prompt_builder');

test('createContext keeps intent, resolve, and metadata', () => {
  const ctx = createContext({
    input: 'raw-data',
    intent: 'describe the goal',
    resolve: 'step-by-step',
    metadata: { id: 123 }
  });
  assert.deepStrictEqual(ctx.input, ['raw-data']);
  assert.equal(ctx.intent, 'describe the goal');
  assert.equal(ctx.resolve, 'step-by-step');
  assert.deepStrictEqual(ctx.metadata, { id: 123 });
});

test('chunkText splits long input', () => {
  const long = 'a'.repeat(5000);
  const ctx = createContext({ input: long, maxChunkSize: 2000 });
  assert.equal(ctx.input.length, 3);
  assert.equal(ctx.input[0].length, 2000);
  assert.equal(ctx.input[2].length, 1000);
});

test('createContext flattens object input preserving fields', () => {
  const ctx = createContext({ input: { user: { id: 7 }, tags: ['a', 'b'] } });
  const combined = ctx.input.join('\n');
  assert.ok(combined.includes('user.id: 7'));
  assert.ok(combined.includes('tags.0: a'));
  assert.ok(combined.includes('tags.1: b'));
});

test('serializeFields outputs key paths', () => {
  const lines = serializeFields({ a: { b: 1 }, list: [2] });
  assert.deepStrictEqual(lines.sort(), ['a.b: 1', 'list.0: 2']);
});

test('formatPrompt builds structured sections', () => {
  const ctx = createContext({
    input: 'hello',
    intent: 'greet',
    resolve: 'return greeting',
    metadata: { source: 'unit-test' }
  });
  const prompt = formatPrompt(ctx);
  assert.ok(prompt.includes('Input:\nhello'));
  assert.ok(prompt.includes('Intent:\ngreet'));
  assert.ok(prompt.includes('Resolve:\nreturn greeting'));
  assert.ok(prompt.includes('"source":"unit-test"'));
});

