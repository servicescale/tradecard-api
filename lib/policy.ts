const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

/**
 * @typedef {{allowed_values?: any[], regex?: string, min_len?: number, max_len?: number,
 *           min_words?: number, max_words?: number}} Constraints
 * @typedef {{fallback?: any, constraints?: Constraints}} FieldRule
 * @typedef {Record<string, FieldRule>} FieldIntentMap
 */

let cache;
function loadMap(file = path.join(__dirname, '..', 'config', 'field_intent_map.yaml')) {
  if (!cache) {
    const txt = fs.readFileSync(file, 'utf8');
    cache = YAML.parse(txt) || {};
  }
  return cache;
}

function enforcePolicy(struct = {}, map = {}) {
  const clean = {};
  const rejected = [];
  for (const [k, v] of Object.entries(struct || {})) {
    const rule = map[k]?.constraints || {};
    let reason;
    const s = typeof v === 'string' ? v : v == null ? '' : String(v);
    if (rule.allowed_values && !rule.allowed_values.includes(v)) reason = 'allowed_values';
    if (!reason && rule.regex && !(new RegExp(rule.regex).test(s))) reason = 'regex';
    if (!reason && rule.min_len != null && s.length < rule.min_len) reason = 'min_len';
    if (!reason && rule.max_len != null && s.length > rule.max_len) reason = 'max_len';
    if (!reason && (rule.min_words != null || rule.max_words != null)) {
      const wc = s.trim().split(/\s+/).filter(Boolean).length;
      if (rule.min_words != null && wc < rule.min_words) reason = 'min_words';
      if (!reason && rule.max_words != null && wc > rule.max_words) reason = 'max_words';
    }
    if (reason) {
      clean[k] = null;
      rejected.push({ field: k, reason });
    } else {
      clean[k] = v;
    }
  }
  return { clean, rejected };
}

module.exports = { loadMap, enforcePolicy };
