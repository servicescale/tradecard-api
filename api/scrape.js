// /api/scrape.js
// Route wrapper around lib/scrape.

const { scrapePage } = require('../lib/scrape');

exports.scrapePage = scrapePage;

module.exports = async function handler(req, res) {
  const url = (req.query && req.query.url) || null;
  if (!url) return res.status(400).json({ error: 'Missing ?url=' });

  try {
    const includeRaw =
      req.query?.includeRaw === '1' ||
      req.query?.includeRaw === 'true';
    const data = await scrapePage(url, { includeRaw });

    const limit = parseInt(req.query?.limitImages || '0', 10);
    if (limit > 0 && Array.isArray(data.page.images)) {
      const before = data.page.images.length;
      data.page.images = data.page.images.slice(0, limit);
      if (data.scrape_metrics) {
        data.scrape_metrics.image_limit = {
          requested: limit,
          before,
          after: data.page.images.length,
          truncated: before > data.page.images.length
        };
      }
    }

    res.status(200).json(data);
  } catch (err) {
    const status = /Invalid URL|http\/https/.test(err.message) ? 400 : 502;
    res.status(status).json({ error: err.message || 'Scrape failed' });
  }
};
