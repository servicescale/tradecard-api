const fs = require('fs');
const YAML = require('yaml');

let cached;

function expandTemplates(rules = []) {
  const out = [];
  for (const rule of rules) {
    if (typeof rule.key === 'string' && rule.key.includes('{i}')) {
      for (let i = 1; i <= 3; i++) {
        const r = JSON.parse(JSON.stringify(rule));
        r.key = r.key.replace('{i}', i);
        if (typeof r.path === 'string') r.path = r.path.replace('{i}', i);
        out.push(r);
      }
    } else {
      out.push(rule);
    }
  }
  return out;
}

function loadIntent(file = 'config/intent_map.yaml') {
  if (!cached) {
    let data;
    try {
      const text = fs.readFileSync(file, 'utf8');
      data = YAML.parse(text);
    } catch {
      data = [];
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (Array.isArray(data.rules)) {
        data = data.rules;
      } else {
        data = Object.entries(data).map(([key, val]) => ({ key, ...(val || {}) }));
      }
    }
    if (!Array.isArray(data)) data = [];
    cached = { rules: expandTemplates(data) };
  }
  return cached;
}

function getByPath(obj, path = '') {
  if (!path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (let part of parts) {
    if (cur === undefined || cur === null) return undefined;
    const m = part.match(/^(.*)\[(\d+)\]$/);
    if (m) {
      cur = cur[m[1]];
      if (!Array.isArray(cur)) return undefined;
      cur = cur[parseInt(m[2], 10)];
      continue;
    }
    if (/^\d+$/.test(part)) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[parseInt(part, 10)];
      continue;
    }
    cur = cur[part];
  }
  return cur;
}

function applyTransforms(value, transforms = []) {
  let val = value;
  for (const t of transforms) {
    if (t === 'trim') {
      if (Array.isArray(val)) val = val.map(v => (typeof v === 'string' ? v.trim() : v));
      else if (typeof val === 'string') val = val.trim();
    } else if (t === 'lower') {
      if (typeof val === 'string') val = val.toLowerCase();
    } else if (t.startsWith('digits')) {
      const extra = t.replace(/^digits/, '').replace(/[()]/g, '');
      const re = new RegExp(`[^0-9${extra.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')}]`, 'g');
      if (typeof val === 'string') val = val.replace(re, '');
    } else if (t === 'csv') {
      if (Array.isArray(val)) {
        val = val.map(v => (typeof v === 'string' ? v.trim() : v)).filter(v => v || v === 0);
        val = val.join(',');
      }
    }
  }
  return val;
}

function applyIntent(tradecard = {}) {
  const { rules } = loadIntent();
  const fields = {};
  const sent_keys = [];
  const dropped_empty = [];
  const dropped_unknown = [];

  for (const rule of rules) {
    const key = rule.key;
    const path = rule.path || rule.source || rule.from;
    const transforms = rule.transforms || rule.transform || [];
    const raw = getByPath(tradecard, path);
    if (raw === undefined || raw === null) {
      dropped_unknown.push(key);
      continue;
    }
    let val = applyTransforms(raw, transforms);
    if (val === undefined || val === null) {
      dropped_empty.push(key);
      continue;
    }
    if (Array.isArray(val)) {
      val = val.filter(v => v !== undefined && v !== null && v !== '').join(',');
    }
    if (typeof val === 'string') val = val.trim();
    if (val === '' || val === null) {
      dropped_empty.push(key);
      continue;
    }
    fields[key] = val;
    sent_keys.push(key);
  }

  return { fields, sent_keys, dropped_empty, dropped_unknown };
}

module.exports = { loadIntent, applyIntent };

