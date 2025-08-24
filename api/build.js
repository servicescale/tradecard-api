// /api/build.js
// Build a TradeCard JSON from crawling a site. Optional OpenAI inference and WordPress push.

const { crawlSite, buildTradecardFromPages } = require('../lib/build');
const { inferTradecard } = require('../lib/infer');
const { createPost, uploadFromUrl, acfSync } = require('../lib/wp');
const { applyIntent } = require('../lib/intent');
const { pickBest } = require('../lib/resolve');

const INFER_THRESHOLD = parseFloat(process.env.INFER_THRESHOLD || '0.7');

module.exports = async function handler(req, res) {
  const startUrl = req.query?.url;
  if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

  const maxPages = Math.min(parseInt(req.query?.maxPages || '12', 10) || 12, 50);
  const maxDepth = Math.min(parseInt(req.query?.maxDepth || '2', 10) || 2, 5);
  const sameOriginOnly = (req.query?.sameOrigin ?? '1') !== '0';
  const infer = req.query.infer === '1';
  const doPush = req.query?.push === '1';
  const trace = [];

  try {
    const t0 = Date.now();
    const pages = await crawlSite(startUrl, { maxPages, maxDepth, sameOriginOnly });
    trace.push({ stage: 'crawl', ms: Date.now() - t0 });
    const result = buildTradecardFromPages(startUrl, pages);
    const raw = {
      anchors: pages.flatMap((p) =>
        Array.isArray(p.anchors)
          ? p.anchors.map((a) => ({ href: a.href || a, text: a.text || '' }))
          : (p.links || []).map((href) => ({ href, text: '' }))
      ),
      headings: pages.flatMap((p) =>
        Array.isArray(p.headings) ? p.headings : Object.values(p.headings || {}).flat()
      ),
      paragraphs: pages.flatMap((p) => p.paragraphs || []),
      images: pages.flatMap((p) =>
        (p.images || []).map((img) => ({ src: img.src || img, alt: img.alt || '' }))
      ),
      meta: pages[0]?.meta || {},
      jsonld: pages[0]?.jsonld || pages[0]?.schema || {},
      url: startUrl
    };
    result.raw = raw;

    const raw_counts = {
      anchors: raw.anchors.length,
      headings: raw.headings.length,
      paragraphs: raw.paragraphs.length,
      images: raw.images.length,
      meta: Object.keys(raw.meta || {}).length,
      jsonld: Array.isArray(raw.jsonld)
        ? raw.jsonld.length
        : Object.keys(raw.jsonld || {}).length
    };

    const countStrings = (obj) => {
      let n = 0;
      if (!obj || typeof obj !== 'object') return n;
      for (const v of Object.values(obj)) {
        if (typeof v === 'string') {
          if (v.trim()) n++;
        } else if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === 'string' && item.trim()) n++;
            else if (item && typeof item === 'object') n += countStrings(item);
          }
        } else if (v && typeof v === 'object') {
          n += countStrings(v);
        }
      }
      return n;
    };
    const tradecard_counts = countStrings(result.tradecard);

    trace.push({ stage: 'intent_input', tradecard_counts, raw_counts });

    trace.push({ stage: 'infer', enabled: infer, key_present: !!process.env.OPENAI_API_KEY });
    if (infer) {
      const inferred = await inferTradecard(result.tradecard);
      trace.push({ stage: 'infer_response', meta: inferred._meta });
      const applied = [];
      delete inferred._meta;

      const desc = pickBest(inferred.business || {}, 'description');
      if (desc.value !== undefined && desc.confidence >= INFER_THRESHOLD) {
        result.tradecard.business.description = desc.value;
        applied.push({ key: 'business.description', confidence: desc.confidence });
        result.needs_inference = result.needs_inference.filter(k => k !== 'business.description');
      }

      const servicesList = pickBest(inferred.services || {}, 'list');
      if (Array.isArray(servicesList.value) && servicesList.confidence >= INFER_THRESHOLD) {
        result.tradecard.services.list = servicesList.value;
        applied.push({ key: 'services.list', confidence: servicesList.confidence });
        result.needs_inference = result.needs_inference.filter(k => k !== 'services.list');
      }

      const areas = pickBest(inferred, 'service_areas');
      if (Array.isArray(areas.value) && areas.confidence >= INFER_THRESHOLD) {
        result.tradecard.service_areas = areas.value;
        applied.push({ key: 'service_areas', confidence: areas.confidence });
        result.needs_inference = result.needs_inference.filter(k => k !== 'service_areas');
      }

      const tone = pickBest(inferred.brand || {}, 'tone');
      if (tone.value !== undefined && tone.confidence >= INFER_THRESHOLD) {
        result.tradecard.brand.tone = tone.value;
        applied.push({ key: 'brand.tone', confidence: tone.confidence });
        result.needs_inference = result.needs_inference.filter(k => k !== 'brand.tone');
      }

      const testi = pickBest(inferred, 'testimonials');
      if (Array.isArray(testi.value) && testi.confidence >= INFER_THRESHOLD) {
        result.tradecard.testimonials = testi.value;
        applied.push({ key: 'testimonials', confidence: testi.confidence });
        result.needs_inference = result.needs_inference.filter(k => k !== 'testimonials');
      }

      trace.push({ stage: 'infer_merge', applied });
    }

    const intent = await applyIntent(result.tradecard, {
      raw,
      resolve: req.query.resolve || 'llm'
    });
    trace.push({ stage: 'intent', audit: intent.audit });
    if (intent.trace) trace.push(...intent.trace);

    const minKeys = Number(process.env.MIN_ACF_KEYS) || 10;
    if (intent.sent_keys.length < minKeys) {
      const debug = req.query?.debug === '1' ? { trace } : undefined;
      return res.status(422).json({
        ok: false,
        reason: 'thin_payload',
        sent: intent.sent_keys.length,
        sample: intent.sent_keys.slice(0, 10),
        debug
      });
    }

    let wordpress;
    if (doPush) {
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
    if (req.query?.debug === '1') output.debug = { trace };

    return res.status(200).json(output);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to build card' });
  }
};
