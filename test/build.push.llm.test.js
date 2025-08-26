const test = require('node:test');
const assert = require('node:assert');

const mockFetch = require('./helpers/mockFetch');
const resetEnv = require('./helpers/resetEnv');
const buildLib = require('../lib/build');
const handler = require('../api/build');

test('build route returns 200 on thin payload when push=0', async () => {
  buildLib.crawlSite = async () => [{
    url: 'http://site.test',
    title: 'Site Title',
    images: [],
    links: [],
    social: [],
    contacts: { emails: [], phones: [] },
    headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }
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
