const test = require('node:test');
const assert = require('node:assert');
const { chunkText, createContext, formatPrompt } = require('../lib/prompt_builder');

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

