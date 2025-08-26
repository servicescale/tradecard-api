const test = require('node:test');
const assert = require('node:assert/strict');
const { proposeForUnresolved } = require('../lib/llmFullFrame');

test('uses full raw and returns allowed proposals', async () => {
  const raw = { anchors: Array.from({ length: 60 }, (_, i) => ({ href: String(i) })) };
  const allowKeys = ['foo', 'baz'];
  const unresolvedKeys = ['foo'];
  let sent;
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test';
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    sent = JSON.parse(body.messages[1].content);
    return { json: async () => ({ choices: [{ message: { content: '{"foo":"bar","baz":"qux","x":"y"}' } }] }) };
  };
  const { proposals } = await proposeForUnresolved({ raw, allowKeys, unresolvedKeys, maxTokens: 1e6 });
  assert.deepEqual(proposals, { foo: 'bar', baz: 'qux' });
  assert.equal(sent.RAW.anchors.length, 60);
  global.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalKey;
});

test('compacts raw when prompt too large', async () => {
  const raw = { anchors: Array.from({ length: 60 }, (_, i) => ({ href: String(i) })) };
  const allowKeys = ['foo'];
  const unresolvedKeys = ['foo'];
  let sent;
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test';
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    sent = JSON.parse(body.messages[1].content);
    return { json: async () => ({ choices: [{ message: { content: '{"foo":"bar"}' } }] }) };
  };
  await proposeForUnresolved({ raw, allowKeys, unresolvedKeys, maxTokens: 1 });
  assert.equal(sent.RAW.anchors.length, 50);
  global.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalKey;
});
