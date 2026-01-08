// /api/structure.js
// Build a structured site overview for downstream assessment.

const { crawlSite } = require('../lib/build');
const { buildSiteStructure } = require('../lib/structure');

module.exports = async function handler(req, res) {
  const startUrl = req.query?.url;
  if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

  const maxPages = Math.min(parseInt(req.query?.maxPages || '12', 10) || 12, 50);
  const maxDepth = Math.min(parseInt(req.query?.maxDepth || '2', 10) || 2, 5);
  const sameOriginOnly = (req.query?.sameOrigin ?? '1') !== '0';
  const includeSitemap = (req.query?.includeSitemap ?? '1') !== '0';

  try {
    const pages = await crawlSite(startUrl, { maxPages, maxDepth, sameOriginOnly, includeSitemap });
    const output = buildSiteStructure(startUrl, pages);
    return res.status(200).json(output);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to build structure' });
  }
};
