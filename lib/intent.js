const fs = require('fs');
const yaml = require('js-yaml');

let cachedRules;

function expandServiceKeys(rules = {}) {
  const out = {};
  for (const [key, val] of Object.entries(rules)) {
    if (key.includes('{i}')) {
      for (let i = 1; i <= 3; i++) {
        out[key.replace('{i}', i)] = val;
      }
    } else {
      out[key] = val;
    }
  }
  return out;
}

function loadIntent(path = 'config/field_intent_map.yaml') {
  const text = fs.readFileSync(path, 'utf8');
  const cleaned = text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('<'))
    .join('\n');
  let doc = {};
  try {
    doc = yaml.load(cleaned) || {};
  } catch {
    doc = {};
  }
  const filtered = Object.fromEntries(
    Object.entries(doc).filter(([k]) => !k.startsWith('_'))
  );
  cachedRules = expandServiceKeys(filtered);
  return cachedRules;
}

function applyIntent(tradecard = {}) {
  const rules = cachedRules || loadIntent();
  const fields = {};
  const sent_keys = [];
  const dropped_empty = [];
  const dropped_unknown = [];

  for (const [key, rawVal] of Object.entries(tradecard || {})) {
    if (!rules[key]) {
      dropped_unknown.push(key);
      continue;
    }
    let val = rawVal;
    if (val === undefined || val === null) {
      dropped_empty.push(key);
      continue;
    }

    let transforms = rules[key]?.transform || rules[key]?.transforms;
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
