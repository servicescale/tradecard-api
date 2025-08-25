// /api/build.js
// Build a TradeCard JSON from crawling a site. Optional WordPress push.

const { crawlSite, buildTradecardFromPages } = require('../lib/build');
const { createPost, uploadFromUrl, acfSync } = require('../lib/wp');
const { applyIntent } = require('../lib/intent');
const { inferTradecard } = require('../lib/infer');
const { getAllowKeys } = require("../lib/acf_contract");

module.exports = async function handler(req, res) {
  const startUrl = req.query?.url;
  if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

  const maxPages = Math.min(parseInt(req.query?.maxPages || '12', 10) || 12, 50);
  const maxDepth = Math.min(parseInt(req.query?.maxDepth || '2', 10) || 2, 5);
  const sameOriginOnly = (req.query?.sameOrigin ?? '1') !== '0';
  const resolveMode = req.query.resolve || 'llm';
  const trace = [];
  const debug = { trace };
  const allow = getAllowKeys();

  try {
    const t0 = Date.now();
    const pages = await crawlSite(startUrl, { maxPages, maxDepth, sameOriginOnly });
    trace.push({ stage: 'crawl', ms: Date.now() - t0 });
    const result = buildTradecardFromPages(startUrl, pages);

    const inferred = await inferTradecard(result.tradecard);
    trace.push({ stage: 'infer', ...inferred._meta });
    if (inferred._meta?.ok) {
      if (inferred.business?.description) {
        result.tradecard.business.description = inferred.business.description;
      }
      if (inferred.services?.list) {
        result.tradecard.services.list = inferred.services.list;
      }
      if (inferred.service_areas !== undefined) {
        result.tradecard.service_areas = inferred.service_areas;
      }
      if (inferred.brand?.tone) {
        result.tradecard.brand.tone = inferred.brand.tone;
      }
      if (inferred.testimonials !== undefined) {
        result.tradecard.testimonials = inferred.testimonials;
      }
    }

    const raw = {
      anchors: (pages || [])
        .flatMap((p) => p.anchors || p.links || [])
        .map((l) =>
          typeof l === 'string'
            ? { href: l, text: '' }
            : { href: l.href, text: l.text || '' }
        ),
      headings: (pages || [])
        .flatMap((p) => Object.values(p.headings || {}))
        .flat()
        .map((t) => ({ text: t })),
      images: (pages || [])
        .flatMap((p) => p.images || [])
        .map((i) =>
          typeof i === 'string'
            ? { src: i, alt: '' }
            : { src: i.src, alt: i.alt || '' }
        ),
      meta: pages?.[0]?.meta || {},
      jsonld: pages?.[0]?.jsonld || pages?.[0]?.schema || [],
      text_blocks: pages?.[0]?.text_blocks || []
    };

    trace.push({
      stage: 'intent_input',
      tradecard_counts: {
        name: !!result.tradecard?.business?.name,
        website: !!result.tradecard?.contacts?.website
      },
      raw_counts: {
        anchors: raw.anchors.length,
        headings: raw.headings.length,
        images: raw.images.length,
        meta: Object.keys(raw.meta || {}).length,
        jsonld: raw.jsonld.length,
        text_blocks: raw.text_blocks.length
      }
    });

    const intent = await applyIntent(result.tradecard, { raw, resolve: resolveMode });
    if (Array.isArray(intent.trace)) debug.trace.push(...intent.trace);

    const fmap = require('../lib/rule_exec').loadIntentMap();
    const required = Object.entries(fmap)
      .filter(([k, v]) => v.priority === 'required' && k.startsWith('identity_') && allow.has(k))
      .map(([k]) => k);
    const presentSet = new Set(intent.sent_keys || []);
    const missingRequired = required.filter(k => !presentSet.has(k));
    const isPush = req.query.push === '1' || req.query.push === 1 || req.query.push === true || req.query.push === 'true';
    if (isPush && missingRequired.length) {
      debug.trace.push({ stage: 'required_check', missingRequired, required });
      return res.status(422).json({ ok: false, reason: 'missing_required', missingRequired, debug });
    }
    let wordpress;
    if (isPush) {
      if (!process.env.WP_BASE || !process.env.WP_BEARER) {
        wordpress = { skipped: true, reason: 'Missing WP_BASE or WP_BEARER' };
      } else {
        const base = process.env.WP_BASE;
        const token = process.env.WP_BEARER;
        const steps = [];
        const pushStep = (step, resp) => {
          steps.push({ step, response: { ok: resp.ok, status: resp.status } });
          trace.push({ stage: 'push', step, ok: resp.ok, status: resp.status });
        };
        let postId;
        try {
          const create = await createPost(base, token, { title: result.tradecard.business.name });
          pushStep('create', create);
          if (create.ok) postId = create.json?.id;

          if (postId && result.tradecard.assets.logo) {
            const up = await uploadFromUrl(base, token, result.tradecard.assets.logo);
            pushStep('upload_logo', up);
            if (up.ok && (up.json?.url || up.json?.source_url)) {
              result.tradecard.assets.logo = up.json.url || up.json.source_url;
            }
          }

          if (postId && result.tradecard.assets.hero) {
            const up = await uploadFromUrl(base, token, result.tradecard.assets.hero);
            pushStep('upload_hero', up);
            if (up.ok && (up.json?.url || up.json?.source_url)) {
              result.tradecard.assets.hero = up.json.url || up.json.source_url;
            }
          }

          if (postId && Array.isArray(result.tradecard.assets.images)) {
            const newImages = [];
            for (const url of result.tradecard.assets.images.slice(0, 10)) {
              const up = await uploadFromUrl(base, token, url);
              steps.push({ step: 'upload_image', url, response: { ok: up.ok, status: up.status } });
              trace.push({ stage: 'push', step: 'upload_image', ok: up.ok, status: up.status });
              if (up.ok && (up.json?.url || up.json?.source_url)) {
                newImages.push(up.json.url || up.json.source_url);
              } else {
                newImages.push(url);
              }
            }
            result.tradecard.assets.images = newImages;
          }

          if (postId) {
            const acf = await acfSync(base, token, postId, intent.fields);
            steps.push({ step: 'acf_sync', sent_keys: intent.sent_keys, response: { status: acf.status } });
            trace.push({ stage: 'push', step: 'acf_sync', ok: acf.ok, status: acf.status });
            const details = { steps, acf_keys: intent.sent_keys };
            wordpress = { ok: acf.ok && create.ok, post_id: postId, details };
          } else {
            wordpress = { ok: false, post_id: postId, details: { steps } };
          }
        } catch (err) {
          steps.push({ step: 'error', error: err.message || String(err) });
          trace.push({ stage: 'push', step: 'error', ok: false });
          wordpress = { ok: false, post_id: postId, details: { steps } };
        }
      }
    } else {
      wordpress = { skipped: true, reason: 'push not requested' };
    }
    result.wordpress = wordpress;

    const output = result;
    if (req.query?.debug === '1') output.debug = debug;

    return res.status(200).json(output);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to build card' });
  }
};
