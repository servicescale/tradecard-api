// /api/crawl.js
// BFS same-origin crawler that reuses scrapePage().

const { crawlSite } = require('../lib/build');
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

module.exports = async function handler(req, res) {
  const requiredKey = process.env.API_KEY;
  if (requiredKey) {
    const key = req.headers['x-api-key'];
    if (!key || key !== requiredKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const startUrl = req.query?.url;
  const maxPages = Math.min(parseInt(req.query?.maxPages || '10', 10) || 10, 50);
  const maxDepth = Math.min(parseInt(req.query?.maxDepth || '2', 10) || 2, 5);
  const sameOriginOnly = (req.query?.sameOrigin ?? '1') !== '0';
  const includeSitemap = (req.query?.includeSitemap ?? '1') !== '0';

  if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

  let origin;
  try {
    const u = new URL(startUrl);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) throw new Error();
    origin = u.origin;
  } catch {
    return res.status(400).json({ error: 'Invalid URL (http/https only)' });
  }

  let pages = [];
  const errors = [];
  try {
    pages = await crawlSite(startUrl, { maxPages, maxDepth, sameOriginOnly, includeSitemap });
  } catch (err) {
    const msg = `Failed to crawl ${startUrl}: ${err.message || String(err)}`;
    console.warn(msg);
    errors.push(msg);
  }

  const result = {
    site: startUrl,
    pages,
    stats: { visited: pages.length, returned: pages.length, maxPages, maxDepth, sameOriginOnly, includeSitemap },
    errors
  };

  return res.status(200).json(result);
};
