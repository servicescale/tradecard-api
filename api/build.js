// /api/build.js
// Build a TradeCard JSON from crawling a site. Optional OpenAI inference.

const { crawlSite, buildTradecardFromPages } = require('../lib/build');
const { inferTradecard } = require('../lib/infer');
const { createPost, uploadFromUrl, acfSync } = require('../lib/wp');
const { mapAcf } = require('../lib/mapAcf');

module.exports = async function handler(req, res) {
  const startUrl = req.query?.url;
  if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

  const maxPages = Math.min(parseInt(req.query?.maxPages || '12', 10) || 12, 50);
  const maxDepth = Math.min(parseInt(req.query?.maxDepth || '2', 10) || 2, 5);
  const sameOriginOnly = (req.query?.sameOrigin ?? '1') !== '0';
  const doInfer = req.query?.infer === '1';
  const doPush = req.query?.push === '1';

  const trace = [];
  const timed = async (stage, target, fn) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      trace.push({ stage, target, ms: Date.now() - t0, ok: true });
      return r;
    } catch (err) {
      trace.push({ stage, target, ms: Date.now() - t0, ok: false });
      throw err;
    }
  };

  try {
    const pages = await timed('crawl', startUrl, () => crawlSite(startUrl, { maxPages, maxDepth, sameOriginOnly }));
    const result = buildTradecardFromPages(startUrl, pages);

    if (doInfer && process.env.OPENAI_API_KEY) {
      try {
        const inferred = await timed('infer', 'openai', () => inferTradecard(result.tradecard));
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
    if (doPush) {
      if (!process.env.WP_BASE || !process.env.WP_BEARER) {
        wordpress = { skipped: true, reason: 'Missing WP_BASE or WP_BEARER' };
        trace.push({ stage: 'push', target: 'wordpress', ms: 0, ok: false });
      } else {
        const base = process.env.WP_BASE;
        const token = process.env.WP_BEARER;
        const steps = [];
        let postId;
        try {
          const create = await timed('push', 'create', () => createPost(base, token, { title: result.tradecard.business.name }));
          steps.push({ step: 'create', ...create });
          if (create.ok) postId = create.json?.id;

          if (postId && result.tradecard.assets.logo) {
            const up = await timed('push', 'upload_logo', () => uploadFromUrl(base, token, result.tradecard.assets.logo));
            steps.push({ step: 'upload_logo', ...up });
            if (up.ok && (up.json?.url || up.json?.source_url)) {
              result.tradecard.assets.logo = up.json.url || up.json.source_url;
            }
          }

          if (postId && result.tradecard.assets.hero) {
            const up = await timed('push', 'upload_hero', () => uploadFromUrl(base, token, result.tradecard.assets.hero));
            steps.push({ step: 'upload_hero', ...up });
            if (up.ok && (up.json?.url || up.json?.source_url)) {
              result.tradecard.assets.hero = up.json.url || up.json.source_url;
            }
          }

          if (postId) {
            const fields = mapAcf(result.tradecard);
            const acf = await timed('push', 'acf_sync', () => acfSync(base, token, postId, fields));
            steps.push({ step: 'acf_sync', ...acf });
            wordpress = { ok: acf.ok && create.ok, post_id: postId, details: { steps } };
          } else {
            wordpress = { ok: false, post_id: postId, details: { steps } };
          }
        } catch (err) {
          steps.push({ step: 'error', error: err.message || String(err) });
          wordpress = { ok: false, post_id: postId, details: { steps } };
        }
      }
    } else {
      wordpress = { skipped: true, reason: 'push not requested' };
    }
    result.wordpress = wordpress;
    result.trace = trace;

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to build card' });
  }
};
