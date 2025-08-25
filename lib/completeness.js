"use strict";
const { expandKeys, categoryOf } = require('./intent_map');

function completeness(map = {}, fields = {}) {
  const keys = expandKeys(map);
  const present_keys = keys.filter((k) => fields[k]);
  const missing = keys.filter((k) => !fields[k]);
  const totals = {
    defined: keys.length,
    present: present_keys.length,
    missing: missing.length,
    coverage_pct: keys.length ? present_keys.length / keys.length : 0
  };
  const by_category = {};
  for (const k of keys) {
    const cat = categoryOf(k);
    if (!by_category[cat]) by_category[cat] = { allowed: 0, present: 0, missing_sample: [] };
    by_category[cat].allowed++;
    if (fields[k]) by_category[cat].present++;
    else if (by_category[cat].missing_sample.length < 5) by_category[cat].missing_sample.push(k);
  }
  const highList = [
    'identity_email',
    'identity_phone',
    'social_links_*',
    'service_1_title',
    'service_1_description'
  ];
  const high_impact_missing = [];
  for (const h of highList) {
    if (h === 'social_links_*') {
      const socialKeys = keys.filter((k) => k.startsWith('social_links_'));
      if (socialKeys.length && socialKeys.some((k) => !fields[k])) high_impact_missing.push(h);
    } else if (keys.includes(h) && !fields[h]) {
      high_impact_missing.push(h);
    }
  }
  return {
    totals,
    present_keys,
    missing_keys_sample: missing.slice(0, 40),
    by_category,
    high_impact_missing
  };
}

module.exports = { completeness };
