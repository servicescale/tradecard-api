"use strict";
const { expandKeys, ruleFor, categoryOf } = require('./intent_map');
const { logMiss } = require('../scripts/log-misses');

const ORDER = ['identity', 'socials', 'services', 'content', 'testimonials', 'trust_theme'];

async function runExecutor({ map = {}, allowSet = new Set(), raw = {}, tradecard = {}, llm = {}, helpers = {} }) {
  const fields = helpers.detSeed ? helpers.detSeed({ raw, tradecard }) : {};
  const audit = Object.keys(fields).map((k) => ({ key: k, strategy: 'det', ok: true }));
  const seeded = new Set(Object.keys(fields));

  const keys = expandKeys(map).sort((a, b) => {
    const ca = ORDER.indexOf(categoryOf(a));
    const cb = ORDER.indexOf(categoryOf(b));
    if (ca !== cb) return ca - cb;
    return a.localeCompare(b);
  });

  for (const key of keys) {
    if (seeded.has(key)) continue;
    const rule = ruleFor(map, key);
    const strat = rule.strategy || 'det';
    let used = strat;
    let v = '';
    let confidence = 0;
    let ok = true;
    let reason;
    try {
      if (strat === 'det') {
        v = helpers.detResolve ? helpers.detResolve(key, rule, { raw, tradecard, fields }) : '';
      } else if (strat === 'llm') {
        v = await llm.resolveField(key, rule, { raw, tradecard, fields });
      } else if (strat === 'det_then_llm') {
        v = helpers.detResolve ? helpers.detResolve(key, rule, { raw, tradecard, fields }) : '';
        if (!v) {
          used = 'llm';
          v = await llm.resolveField(key, rule, { raw, tradecard, fields });
        } else {
          used = 'det';
        }
      } else if (strat === 'derive') {
        used = 'derive';
        v = helpers.derive ? helpers.derive(key, rule, { fields, raw, tradecard }) : '';
      }
    } catch (err) {
      ok = false;
      reason = err.message || String(err);
    }
    if (v && typeof v === 'object' && 'value' in v) {
      confidence = typeof v.confidence === 'number' ? v.confidence : 0;
      v = v.value;
    }
    v = String(v ?? '').trim();
    if (allowSet.has(key) && v) {
      fields[key] = v;
    }
    if (!v) ok = false;
    if (!ok && confidence > 0.7) ok = true;
    const entry = { key, strategy: used, ok };
    if (confidence) entry.confidence = confidence;
    if (!ok && reason) entry.reason = reason;
    audit.push(entry);
    if (!ok) {
      logMiss({ key, snippet: raw[key], rule, suggestion: '' });
    }
  }

  return { fields, audit };
}

module.exports = { runExecutor };
