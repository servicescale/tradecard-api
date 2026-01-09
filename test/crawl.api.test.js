const test = require('node:test');
const assert = require('node:assert');

const buildLib = require('../lib/build');
const handler = require('../api/crawl');

function createRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

test('crawl route returns validation errors without crawling', async () => {
  const originalCrawl = buildLib.crawlSite;
  buildLib.crawlSite = async () => {
    throw new Error('crawl should not be called');
  };

  try {
    const resMissing = createRes();
    await handler({ query: {} }, resMissing);
    assert.equal(resMissing.statusCode, 400);
    assert.equal(resMissing.body.error, 'Missing ?url=');

    const resInvalid = createRes();
    await handler({ query: { url: 'ftp://example.com' } }, resInvalid);
    assert.equal(resInvalid.statusCode, 400);
    assert.equal(resInvalid.body.error, 'Invalid URL (http/https only)');
  } finally {
    buildLib.crawlSite = originalCrawl;
  }
});

test('crawl route caps parameters and returns stubbed pages', async () => {
  const originalCrawl = buildLib.crawlSite;
  let captured = null;
  buildLib.crawlSite = async (startUrl, options) => {
    captured = { startUrl, options };
    return [{ url: startUrl, title: 'Example' }];
  };

  try {
    const req = {
      query: {
        url: 'https://example.com',
        maxPages: '500',
        maxDepth: '10',
        sameOrigin: '0',
        includeSitemap: '0'
      }
    };
    const res = createRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.site, 'https://example.com');
    assert.equal(res.body.pages.length, 1);
    assert.deepEqual(res.body.pages[0], { url: 'https://example.com', title: 'Example' });

    assert.deepEqual(captured, {
      startUrl: 'https://example.com',
      options: {
        maxPages: 50,
        maxDepth: 5,
        sameOriginOnly: false,
        includeSitemap: false
      }
    });
  } finally {
    buildLib.crawlSite = originalCrawl;
  }
});
