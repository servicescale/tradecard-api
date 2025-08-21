// /api/build.js
// Build a TradeCard JSON from crawling a site. Optional OpenAI inference.

const { crawlSite, buildTradecardFromPages } = require('../lib/build');
const { inferTradecard } = require('../lib/infer');
const { pushToWordpress } = require('../lib/wordpress');

module.exports = async function handler(req, res) {
  const startUrl = req.query?.url;
  if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

  const maxPages = Math.min(parseInt(req.query?.maxPages || '12', 10) || 12, 50);
  const maxDepth = Math.min(parseInt(req.query?.maxDepth || '2', 10) || 2, 5);
  const sameOriginOnly = (req.query?.sameOrigin ?? '1') !== '0';

  try {
    const pages = await crawlSite(startUrl, { maxPages, maxDepth, sameOriginOnly });
    const result = buildTradecardFromPages(startUrl, pages);

    if (req.query?.infer === '1' && process.env.OPENAI_API_KEY) {
      try {
        const inferred = await inferTradecard(result.tradecard);
        const applied = [];
        if (inferred?.business?.description) {
          result.tradecard.business.description = inferred.business.description;
          applied.push('business.description');
        }
        if (Array.isArray(inferred?.services?.list)) {
          result.tradecard.services.list = inferred.services.list;
          applied.push('services.list');
        }
        if (Array.isArray(inferred?.service_areas)) {
          result.tradecard.service_areas = inferred.service_areas;
          applied.push('service_areas');
        }
        if (inferred?.brand?.tone) {
          result.tradecard.brand.tone = inferred.brand.tone;
          applied.push('brand.tone');
        }
        if (Array.isArray(inferred?.testimonials)) {
          result.tradecard.testimonials = inferred.testimonials;
          applied.push('testimonials');
        }
        result.needs_inference = result.needs_inference.filter(k => !applied.includes(k));
      } catch (err) {
        console.warn('Inference failed:', err.message || err);
      }
    }

    let wordpress;
    if (req.query?.push === '1') {
      if (!process.env.WP_BASE || !process.env.WP_BEARER) {
        wordpress = { skipped: true, reason: 'Missing WP_BASE or WP_BEARER' };
      } else {
        try {
          wordpress = await pushToWordpress(result.tradecard);
        } catch (err) {
          wordpress = { ok: false, error: err.message || String(err) };
        }
      }
    } else {
      wordpress = { skipped: true, reason: 'push not requested' };
    }
    result.wordpress = wordpress;

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to build card' });
  }
};
