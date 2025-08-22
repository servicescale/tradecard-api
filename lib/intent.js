const fs = require('fs');
const path = require('path');
const { readYaml } = require('./config');

let cached;

function expandServiceKeys(keys = [], indices = [1, 2, 3]) {
  const out = [];
  for (const key of keys) {
    if (key.includes('{i}')) {
      for (const i of indices) {
        out.push(key.replace('{i}', i));
      }
    } else {
      out.push(key);
    }
  }
  return out;
}

function loadIntent(rel = 'config/field_intent_map.yaml') {
  if (cached) return cached;

  let doc = {};
  let raw = '';
  try {
    doc = readYaml(rel) || {};
  } catch {
    // fall back to raw text scanning
    const candidates = [
      path.join(process.cwd(), rel),
      path.join(__dirname, '..', rel),
      path.resolve(rel),
    ];
    for (const p of candidates) {
      try {
        raw = fs.readFileSync(p, 'utf8');
        break;
      } catch {}
    }
  }

  let allowKeys = [];
  if (doc.allow) {
    allowKeys = Array.isArray(doc.allow) ? doc.allow : [].concat(doc.allow);
  } else if (Object.keys(doc).length) {
    allowKeys = Object.keys(doc).filter(
      (k) => !k.startsWith('_') && k !== 'service_index' && k !== 'allow'
    );
  } else if (raw) {
    const re = /^([A-Za-z0-9_{}]+):/gm;
    let m;
    while ((m = re.exec(raw))) {
      const k = m[1];
      if (k.startsWith('_') || k === 'service_index' || k === 'allow') continue;
      allowKeys.push(k);
    }
  }

  const indices = doc.service_index || [1, 2, 3];
  const allow = new Set(expandServiceKeys(allowKeys, indices));

  cached = { allow, doc };
  return cached;
}

function applyIntent(tradecard = {}) {
  const { allow, doc } = cached || loadIntent();
  const fields = {};
  const sent_keys = [];
  const dropped_empty = [];
  const dropped_unknown = [];

  for (const [key, rawVal] of Object.entries(tradecard || {})) {
    if (!allow.has(key)) {
      dropped_unknown.push(key);
      continue;
    }
    let val = rawVal;
    if (val === undefined || val === null) {
      dropped_empty.push(key);
      continue;
    }

    let transforms = doc[key]?.transform || doc[key]?.transforms;
    if (!Array.isArray(transforms)) transforms = transforms ? [transforms] : [];

    if (Array.isArray(val)) {
      if (transforms.includes('csv') || transforms.includes('csv(array)')) {
        val = val
          .flatMap((v) => {
            if (v === undefined || v === null) return [];
            if (Array.isArray(v)) return v;
            return [v];
          })
          .map((v) => (typeof v === 'string' ? v : String(v)))
          .map((v) => v.trim())
          .filter(Boolean)
          .join(',');
      } else {
        val = val[0];
      }
    }

    if (typeof val === 'string') {
      if (transforms.includes('trim')) val = val.trim();
      if (transforms.includes('lower')) val = val.toLowerCase();
      if (transforms.some((t) => t.startsWith('digits'))) {
        val = val.replace(/[^+\d]/g, '');
      }
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      val = String(val);
    } else if (val && typeof val === 'object') {
      val = '';
    }

    if (typeof val === 'string' && transforms.length === 0) {
      val = val.trim();
    }

    if (val === '' || val === undefined) {
      dropped_empty.push(key);
      continue;
    }

    fields[key] = val;
    sent_keys.push(key);
  }

  return { fields, sent_keys, dropped_empty, dropped_unknown };
}

module.exports = { loadIntent, applyIntent };
