const test = require('node:test');
const assert = require('node:assert/strict');
const { proposeForUnresolved } = require('../lib/llmFullFrame');

test('uses full raw and returns allowed proposals', async () => {
  const raw = { anchors: Array.from({ length: 60 }, (_, i) => ({ href: String(i) })) };
  const allowKeys = ['foo', 'baz'];
  const unresolvedKeys = ['foo'];
  let sentFirst;
  let call = 0;
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test';
  global.fetch = async (url, opts) => {
    call++;
    const body = JSON.parse(opts.body);
    const payload = JSON.parse(body.messages[1].content);
    if (call === 1) sentFirst = payload;
    return {
      json: async () => ({ choices: [{ message: { content: '{"foo":"bar","baz":"qux","x":"y"}' } }] })
    };
  };
  const { proposals, discrepancies } = await proposeForUnresolved({ raw, allowKeys, unresolvedKeys, maxTokens: 1e6 });
  assert.deepEqual(proposals, { foo: 'bar', baz: 'qux' });
  assert.deepEqual(discrepancies, []);
  assert.equal(sentFirst.RAW.anchors.length, 60);
  global.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalKey;
});

test('compacts raw when prompt too large', async () => {
  const raw = { anchors: Array.from({ length: 60 }, (_, i) => ({ href: String(i) })) };
  const allowKeys = ['foo'];
  const unresolvedKeys = ['foo'];
  let sentFirst;
  let call = 0;
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test';
  global.fetch = async (url, opts) => {
    call++;
    const body = JSON.parse(opts.body);
    const payload = JSON.parse(body.messages[1].content);
    if (call === 1) sentFirst = payload;
    return { json: async () => ({ choices: [{ message: { content: '{"foo":"bar"}' } }] }) };
  };
  await proposeForUnresolved({ raw, allowKeys, unresolvedKeys, maxTokens: 1 });
  assert.equal(sentFirst.RAW.anchors.length, 50);
  global.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalKey;
});

test('second pass can correct an initial mistake', async () => {
  const raw = {};
  const allowKeys = ['foo'];
  const unresolvedKeys = ['foo'];
  let sentSecond;
  let call = 0;
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test';
  global.fetch = async (url, opts) => {
    call++;
    const body = JSON.parse(opts.body);
    const payload = JSON.parse(body.messages[1].content);
    if (call === 2) sentSecond = payload;
    if (call === 1) {
      return { json: async () => ({ choices: [{ message: { content: '{"foo":"wrong"}' } }] }) };
    }
    return { json: async () => ({ choices: [{ message: { content: '{"foo":"right"}' } }] }) };
  };
  const { proposals, discrepancies } = await proposeForUnresolved({ raw, allowKeys, unresolvedKeys });
  assert.deepEqual(proposals, { foo: 'right' });
  assert.deepEqual(discrepancies, ['foo']);
  assert.equal(sentSecond.ORIGINAL.foo, 'wrong');
  global.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalKey;
});
