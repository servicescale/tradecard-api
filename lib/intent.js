const fs = require('fs');
const path = require('path');
const { readYaml } = require('./config');
const { inferTradecard } = require('./infer');

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

  const indices = doc.service_index || [1, 2, 3];

  // expand service_{i}_* templates inside doc itself
  for (const key of Object.keys(doc)) {
    if (!key.includes('{i}')) continue;
    for (const i of indices) {
      const expanded = key.replace('{i}', i);
      if (doc[expanded] === undefined) doc[expanded] = doc[key];
    }
    delete doc[key];
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

  const allow = new Set(expandServiceKeys(allowKeys, indices));

  cached = { allow, doc };
  return cached;
}

function resolvePath(obj = {}, dot = '') {
  if (!dot) return undefined;
  const parts = dot.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined;
    const m = p.match(/(.+)\[(\d+)\]$/);
    if (m) {
      cur = cur[m[1]];
      if (!Array.isArray(cur)) return undefined;
      cur = cur[parseInt(m[2], 10)];
    } else {
      cur = cur[p];
    }
  }
  return cur;
}

function applyTransforms(val, transforms = []) {
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
  return val;
}

function validate(val, constraints = {}) {
  if (val === undefined || val === null || val === '') {
    return { ok: false, reason: 'missing' };
  }
  const str = String(val);
  if (constraints.min_length !== undefined && str.length < constraints.min_length) {
    return { ok: false, reason: 'min_length' };
  }
  if (constraints.no_generic_terms) {
    const terms = Array.isArray(constraints.no_generic_terms)
      ? constraints.no_generic_terms
      : ['tbc', 'tbd', 'n/a', 'na', 'none', 'unknown', 'owner', 'manager', 'staff'];
    const lower = str.toLowerCase();
    if (terms.map((t) => t.toLowerCase()).includes(lower)) {
      return { ok: false, reason: 'generic' };
    }
  }
  return { ok: true };
}

async function applyIntent(tradecard = {}, opts = {}) {
  const { allow, doc } = cached || loadIntent();
  const fields = {};
  const sent_keys = [];
  const dropped_empty = [];
  const dropped_unknown = [];
  const audit = [];

  const keys = Array.from(allow);

  for (const key of keys) {
    const rule = doc[key] || {};
    const sourcePath = rule.source || key;
    let val = resolvePath(tradecard, sourcePath);
    let source = 'tradecard';

    const transforms = Array.isArray(rule.transforms)
      ? rule.transforms
      : rule.transforms ? [rule.transforms] : [];
    val = applyTransforms(val, transforms);

    let { ok, reason } = validate(val, rule.constraints || {});

    if (!ok) {
      if (rule.when_missing === 'constant' && typeof rule.constant === 'string') {
        val = applyTransforms(rule.constant, transforms);
        ({ ok, reason } = validate(val, rule.constraints || {}));
        source = 'tradecard';
      } else if (rule.when_missing === 'llm' && opts.infer) {
        try {
          const inferred = await inferTradecard(tradecard, [key]);
          let infVal = resolvePath(inferred, sourcePath) ?? resolvePath(inferred, key) ?? inferred[key];
          if (infVal && typeof infVal === 'object' && 'value' in infVal) infVal = infVal.value;
          val = applyTransforms(infVal, transforms);
          ({ ok, reason } = validate(val, rule.constraints || {}));
          source = 'llm';
        } catch {
          // ignore inference errors
        }
      }
    }

    if (ok && val !== '' && val !== undefined) {
      fields[key] = val;
      sent_keys.push(key);
      audit.push({ key, status: 'sent', source, len: String(val).length });
    } else {
      dropped_empty.push(key);
      audit.push({ key, status: ok ? 'missing' : 'invalid', reason, source, len: val ? String(val).length : 0 });
    }
  }

  return { fields, sent_keys, dropped_empty, dropped_unknown, audit };
}

module.exports = { loadIntent, applyIntent };
