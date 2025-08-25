"use strict";
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function loadIntentMap(file = path.join(__dirname, '..', 'config', 'field_intent_map.yaml')) {
  const text = fs.readFileSync(file, 'utf8');
  return YAML.parse(text) || {};
}

function expandKeys(map = {}) {
  const keys = [];
  const idx = Array.isArray(map.service_index) ? map.service_index : [1, 2, 3];
  for (const [k, v] of Object.entries(map)) {
    if (k === 'service_index') continue;
    if (k.includes('{i}')) {
      for (const i of idx) keys.push(k.replace('{i}', i));
    } else {
      keys.push(k);
    }
  }
  return keys;
}

function requiredFromMap(map = {}) {
  const req = new Set();
  const idx = Array.isArray(map.service_index) ? map.service_index : [1, 2, 3];
  for (const [k, rule] of Object.entries(map)) {
    if (k === 'service_index') continue;
    const isReq = rule?.priority === 'required' || rule?.required === true;
    if (k.includes('{i}')) {
      for (const i of idx) if (isReq) req.add(k.replace('{i}', i));
    } else if (isReq) {
      req.add(k);
    }
  }
  return req;
}

function ruleFor(map = {}, key) {
  if (map[key]) return normalizeRule(map[key]);
  for (const [k, rule] of Object.entries(map)) {
    if (!k.includes('{i}')) continue;
    const rx = new RegExp('^' + k.replace('{i}', '(\\d+)') + '$');
    if (rx.test(key)) return normalizeRule(rule);
  }
  return normalizeRule({});
}

function normalizeRule(rule = {}) {
  const out = { strategy: rule.strategy || 'det' };
  if (rule.transforms) out.transforms = rule.transforms;
  if (rule.llm) out.llm = rule.llm;
  if (rule.derive) out.derive = rule.derive;
  return out;
}

function categoryOf(key = '') {
  if (key.startsWith('identity_')) return 'identity';
  if (key.startsWith('social_links_')) return 'socials';
  if (key.startsWith('service_')) return 'services';
  if (key.startsWith('content_')) return 'content';
  if (key.startsWith('testimonial_') || key.startsWith('testimonials_')) return 'testimonials';
  if (key.startsWith('trust_')) return 'trust_theme';
  return 'other';
}

module.exports = { loadIntentMap, expandKeys, requiredFromMap, ruleFor, categoryOf };
