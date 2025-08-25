const test = require('node:test');
const assert = require('node:assert');

const mockFetch = require('./helpers/mockFetch');
const resetEnv = require('./helpers/resetEnv');
const buildLib = require('../lib/build');
const handler = require('../api/build');

test('build route returns 422 on policy failure when push=1', async () => {
  buildLib.crawlSite = async () => [{
    url: 'http://site.test',
    title: 'Site Title',
    images: [],
    links: [],
    social: [],
    contacts: { emails: [], phones: [] },
    headings: { h1: [], h2: [], h3: [] }
  }];

  resetEnv({ OPENAI_API_KEY: 'k' });
  let body;
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': (url, opts) => {
      body = JSON.parse(opts.body);
      return { json: { choices: [ { message: { content: '{}' } } ] } };
    }
  });

  const req = { query: { url: 'http://site.test', push: '1', resolve: 'none' } };
  const res = { status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; } };
  await handler(req, res);
  restore();

  assert.equal(res.statusCode, 422);
  assert.equal(res.body.reason, 'policy_failed');
  assert.ok(Array.isArray(res.body.missingRequired));
  if (body) {
    const user = JSON.parse(body.messages[1].content);
    assert.equal(user.context.business_name, 'site.test');
    assert.equal(user.context.contacts.website, 'http://site.test');
  }
});

test('build route returns 200 on thin payload when push=0', async () => {
  buildLib.crawlSite = async () => [{
    url: 'http://site.test',
    title: 'Site Title',
    images: [],
    links: [],
    social: [],
    contacts: { emails: [], phones: [] },
    headings: { h1: [], h2: [], h3: [] }
  }];

  resetEnv({ OPENAI_API_KEY: 'k' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': {
      json: {
        choices: [ { message: { content: '{}' } } ]
      }
    }
  });

  const req = { query: { url: 'http://site.test', push: '0', resolve: 'none' } };
  const res = { status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; } };
  await handler(req, res);
  restore();

  assert.equal(res.statusCode, 200);
});
