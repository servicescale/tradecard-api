// /api/crawl.js
// BFS same-origin crawler that reuses scrapePage().

const { scrapePage } = require('./scrape');
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

  if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

  let origin;
  try {
    const u = new URL(startUrl);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) throw new Error();
    origin = u.origin;
  } catch {
    return res.status(400).json({ error: 'Invalid URL (http/https only)' });
  }

  const errors = [];
  const queue = [[startUrl, 0]];
  const visited = new Set();
  const pages = [];

  while (queue.length && pages.length < maxPages) {
    const [url, depth] = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const { page } = await scrapePage(url);
      pages.push(page);

      if (depth < maxDepth) {
        const nextLinks = (page.links || []).filter((href) => {
          if (!href) return false;
          if (sameOriginOnly && !href.startsWith(origin)) return false;
          if (href.includes('#')) return false;
          return true;
        });
        for (const href of nextLinks) {
          if (pages.length + queue.length >= maxPages) break;
          if (!visited.has(href)) queue.push([href, depth + 1]);
        }
      }
    } catch (err) {
      const msg = `Failed to scrape ${url}: ${err.message || String(err)}`;
      console.warn(msg);
      errors.push(msg);
    }
  }

  const result = {
    site: startUrl,
    pages,
    stats: { visited: visited.size, returned: pages.length, maxPages, maxDepth, sameOriginOnly },
    errors
  };

  return res.status(200).json(result);
};
