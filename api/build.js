// /api/build.js
// Build a TradeCard JSON from crawling a site. Optional WordPress push.

const { crawlSite, buildTradecardFromPages, buildAuditSnapshot, collectRawFromPages } = require('../lib/build');
const { createPost, uploadFromUrl, acfSync } = require('../lib/wp');
const { applyIntent } = require('../lib/intent');
const { inferTradecard } = require('../lib/infer');
const { getAllowKeys, hasACFKey, getAliases } = require("../lib/acf_contract");
const { loadMap, enforcePolicy } = require("../lib/policy");
const { computeCoverage } = require('../lib/coverage');
const { resolveGate, publishGate } = require('../lib/gates');
const { Logger } = require('../lib/logger');
const { lookupABN } = require('../services/abrLookup');

module.exports = async function handler(req, res) {
  const startUrl = req.query?.url;
  if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

  const maxPages = Math.min(parseInt(req.query?.maxPages || '12', 10) || 12, 50);
  const maxDepth = Math.min(parseInt(req.query?.maxDepth || '2', 10) || 2, 5);
  const sameOriginOnly = (req.query?.sameOrigin ?? '1') !== '0';
  const includeSitemap = (req.query?.includeSitemap ?? '1') !== '0';
  const fullFrame = ['1', 'true', 1, true].includes(req.query.full_frame);
  const noLLM = ['1', 'true', 1, true].includes(req.query.no_llm);
  const debugMode = ['1', 'true', 1, true].includes(req.query?.debug);
  Logger.setVerbose(debugMode);
  const trace = [];
  const debug = { trace };
  const aliases = getAliases();

  try {
    Logger.log('BUILD', 'Build started', { url: startUrl, maxPages, maxDepth });
    const t0 = Date.now();
    const pages = await crawlSite(startUrl, { maxPages, maxDepth, sameOriginOnly, includeSitemap });
    const crawlMs = Date.now() - t0;
    trace.push({ stage: 'crawl', ms: crawlMs });
    Logger.log('CRAWL', 'Crawl completed', { pages: pages.length, ms: crawlMs });
    const detectStart = Date.now();
    const result = buildTradecardFromPages(startUrl, pages);
    Logger.log('DETECTION', 'Tradecard extracted', { ms: Date.now() - detectStart });

    const raw = collectRawFromPages(startUrl, pages);
    result.audit = buildAuditSnapshot(startUrl, pages, { raw });

    const inferStart = Date.now();
    const inferred = await inferTradecard({
      tradecard: result.tradecard,
      raw,
      identity: {
        email: result.tradecard?.contacts?.emails?.[0] || null,
        phone: result.tradecard?.contacts?.phones?.[0] || null,
        website: result.tradecard?.contacts?.website || null,
        state: raw?.identity_state || null,
        abn: result.tradecard?.identity_abn || null,
        abn_source: result.tradecard?.identity_abn_source || null
      },
      disabled: noLLM
    });
    trace.push({ stage: 'infer', ...inferred._meta });
    Logger.log('LLM_MERGE', 'Inference completed', { ms: Date.now() - inferStart, meta: inferred._meta });
    result.profile = inferred.profile;
    if (inferred.evidence) result.profile_evidence = inferred.evidence;
    if (inferred._meta?.ok) {
      const profile = inferred.profile || {};
      if (profile.identity_business_description) {
        result.tradecard.business.description = profile.identity_business_description;
      }
      if (Array.isArray(profile.identity_services) && profile.identity_services.length) {
        result.tradecard.services.list = profile.identity_services.map((svc) => ({
          title: svc.name,
          description: svc.description ?? null
        }));
      }
      if (Array.isArray(profile.service_areas) && profile.service_areas.length) {
        result.tradecard.service_areas = profile.service_areas;
      }
    }

    const intentStart = Date.now();
    const intent = await applyIntent(result.tradecard, { raw, fullFrame, opts: { noLLM } });
    Logger.log('AUDIT', 'Intent resolved', { ms: Date.now() - intentStart, fields: Object.keys(intent.fields || {}).length });
    if (Array.isArray(intent.trace)) debug.trace.push(...intent.trace);
    if (Array.isArray(intent.audit)) {
      const failed = intent.audit.filter((entry) => !entry.ok).length;
      Logger.log('AUDIT', 'Audit summary', { total: intent.audit.length, failed });
    }

    const abrInput = {
      businessName: intent.fields.identity_business_name || result.tradecard.business.name,
      tradingName: intent.fields.identity_trading_name || null,
      state: intent.fields.identity_state || null
    };
    if (intent.fields.identity_abn_source !== 'abr') {
      intent.fields.identity_abn = null;
      intent.fields.identity_abn_source = null;
    }
    if (abrInput.businessName && intent.fields.identity_abn_source !== 'abr') {
      const abrResult = await lookupABN(abrInput);
      if (abrResult) {
        intent.fields.identity_abn = abrResult.abn;
        intent.fields.identity_abn_source = 'abr';
      } else {
        intent.fields.identity_abn = null;
      }
      trace.push({ stage: 'abr_lookup', found: !!abrResult });
    }

    const map = loadMap();
    const { clean, rejected } = enforcePolicy(intent.fields, map);
    intent.fields = clean;
    intent.sent_keys = Object.keys(clean).filter(k => clean[k] !== null);
    debug.trace.push({ step: 'policy_enforce', rejected });
    result.intent = intent;
    const pushParam = Array.isArray(req.query.push) ? req.query.push[0] : req.query.push;
    const isPush = ['1', 'true', 1, true].includes(pushParam);
    const guardPush = pushParam === '1' || pushParam === 1;
    const min = Number(process.env.MIN_ACF_KEYS)||10;

    const allow = getAllowKeys();
    const required = Object.keys(map).filter((k) => map[k]?.priority === 'required' && allow.has(k));
    const coverage = computeCoverage(clean, allow);
    const requiredMissing = required.filter((k) => !clean[k]);
    const covEnv = Number(process.env.COVERAGE_THRESHOLD);
    const covThreshold = !Number.isNaN(covEnv) && covEnv < 0.5 ? covEnv : 0.5;
    const resolveDecision = resolveGate({ coverage, requiredPresent: requiredMissing.length === 0, threshold: covThreshold });
    trace.push({ stage: 'gate', type: 'resolve', ...resolveDecision, coverage });
    Logger.log('BUILD', 'Resolve gate decision', resolveDecision);

    if (guardPush && (intent.sent_keys||[]).length < min) {
      return res.status(422).json({
        ok: false,
        reason: 'thin_payload',
        sent: (intent.sent_keys||[]).length,
        sample: (intent.sent_keys||[]).slice(0,10),
        debug
      });
    }
    if (!isPush) {
      result.ok = true;
      result.wordpress = { skipped: true, reason: 'push not requested' };
      if (req.query?.debug === '1') result.debug = debug;
      return res.status(200).json(result);
    }
    let wordpress;
    if (isPush) {
      const publishDecision = publishGate({ resolvePass: resolveDecision.pass, requiredMissing });
      trace.push({ stage: 'gate', type: 'publish', ...publishDecision, missing: requiredMissing });
      if (!publishDecision.pass) {
        return res.status(422).json({ ok: false, reason: publishDecision.reason, missingRequired: requiredMissing, debug });
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
            const payload = {};
            for (const [k, v] of Object.entries(intent.fields || {})) {
              const key = aliases[k] || k;
              if (hasACFKey(key)) payload[key] = v === null ? '' : v;
            }
            const sent_keys = Object.keys(payload);
            debug.trace.push({ step: 'acf_sync', sent_keys });
            const acf = await acfSync(base, token, postId, payload);
            steps.push({ step: 'acf_sync', sent_keys, response: { status: acf.status } });
            trace.push({ stage: 'push', step: 'acf_sync', sent_keys, ok: acf.ok, status: acf.status });
            const details = { steps, acf_keys: sent_keys };
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
    }
    result.wordpress = wordpress;

    const output = result;
    if (debugMode) output.debug = debug;

    const totalFields = Object.keys(intent.fields || {}).length;
    const unresolvedFields = Object.keys(intent.fields || {}).filter((k) => !intent.fields?.[k]).length;
    const resolvedCount = totalFields - unresolvedFields;
    const successRate = totalFields ? `${((resolvedCount / totalFields) * 100).toFixed(2)}%` : '0%';
    Logger.log('BUILD', 'Build completed', { totalFields, unresolvedFields, successRate });

    return res.status(200).json(output);
  } catch (err) {
    Logger.error('BUILD', 'Build failed', { message: err.message || String(err) });
    return res.status(500).json({ error: err.message || 'Failed to build card' });
  }
};
