// /api/build.js
// Build a TradeCard JSON from crawling a site. Optional WordPress push.

const { crawlSite, buildTradecardFromPages } = require('../lib/build');
const { createPost, uploadFromUrl, acfSync } = require('../lib/wp');
const { applyIntent } = require('../lib/intent');

module.exports = async function handler(req, res) {
  const startUrl = req.query?.url;
  if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

  const maxPages = Math.min(parseInt(req.query?.maxPages || '12', 10) || 12, 50);
  const maxDepth = Math.min(parseInt(req.query?.maxDepth || '2', 10) || 2, 5);
  const sameOriginOnly = (req.query?.sameOrigin ?? '1') !== '0';
  const resolveMode = req.query.resolve || 'llm';
  const doPush = req.query?.push === '1';
  const trace = [];
  const debug = { trace };

  try {
    const t0 = Date.now();
    const pages = await crawlSite(startUrl, { maxPages, maxDepth, sameOriginOnly });
    trace.push({ stage: 'crawl', ms: Date.now() - t0 });
    const result = buildTradecardFromPages(startUrl, pages);
    const raw = {
      anchors: (pages || [])
        .flatMap((p) => p.links || [])
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
      jsonld: pages?.[0]?.jsonld || pages?.[0]?.schema || []
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
        jsonld: raw.jsonld.length
      }
    });

    const intent = await applyIntent(result.tradecard, { raw, resolve: resolveMode });
    if (Array.isArray(intent.trace)) debug.trace.push(...intent.trace);

    const min = Number(process.env.MIN_ACF_KEYS) || 10;
    let wordpress;
    if (doPush) {
      if ((intent.sent_keys || []).length < min) {
        return res.status(422).json({
          ok: false,
          reason: 'thin_payload',
          sent: (intent.sent_keys || []).length,
          sample: (intent.sent_keys || []).slice(0, 10),
          debug
        });
      }

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
