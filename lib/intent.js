const fs = require('fs');
const path = require('path');
const { readYaml } = require('./config');
const { resolveWithLLM } = require('./llm_resolver');

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

function getByPath(obj = {}, spec) {
  if (Array.isArray(spec)) {
    for (const s of spec) {
      const v = getByPath(obj, s);
      if (v !== undefined && v !== null) {
        if (typeof v === 'string' && v.trim() === '') continue;
        if (Array.isArray(v) && v.length === 0) continue;
        return v;
      }
    }
    return undefined;
  }

  const dot = spec;
  if (!dot) return undefined;
  const parts = dot.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined;
    const m = p.match(/^(.+)\[(.+)\]$/);
    if (m) {
      const key = m[1];
      let idx = m[2];
      cur = cur[key];
      if (!Array.isArray(cur)) return undefined;
      if (/^\d+$/.test(idx)) {
        cur = cur[parseInt(idx, 10)];
      } else if (idx.includes('=')) {
        const [k, v] = idx.split('=');
        cur = cur.find((s) => s && s[k] === v);
      } else {
        cur = cur.find((s) => s && s.platform === idx);
      }
    } else {
      cur = cur[p];
    }
  }
  return cur;
}

function defaultSource(key = '') {
  const base = {
    identity_business_name: 'business.name',
    identity_website_url: 'contacts.website',
    identity_email: 'contacts.emails[0]',
    identity_phone: 'contacts.phones[0]',
    identity_logo_url: 'assets.logo',
    business_description: 'business.description',
    service_areas_csv: 'service_areas',
  };
  if (base[key]) return base[key];

  if (key.startsWith('social_links_')) {
    const platform = key.slice('social_links_'.length);
    return `social[platform=${platform}].url`;
  }

  const m = key.match(/^service_(\d+)_(.+)$/);
  if (m) {
    const idx = parseInt(m[1], 10) - 1;
    const field = m[2];
    if (field === 'image_url') return `services.list[${idx}].image`;
    const inc = field.match(/^inclusion_(\d+)$/);
    if (inc) return `services.list[${idx}].inclusions[${parseInt(inc[1], 10) - 1}]`;
    return `services.list[${idx}].${field}`;
  }

  return undefined;
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

async function applyIntent(tradecard = {}, { raw = {}, infer = false, resolve = 'hybrid' } = {}) {
  const { doc, allow } = cached || loadIntent();
  const allowKeys = Array.from(allow);
  const fields = {};
  const sent_keys = new Set();
  const dropped_empty = [];
  const dropped_unknown = [];
  const audit = [];
  const trace = [];

  for (const key of allowKeys) {
    const rule = doc[key] || {};
    const sourcePath = rule.source || defaultSource(key) || key;
    const transforms = Array.isArray(rule.transforms)
      ? rule.transforms
      : rule.transforms ? [rule.transforms] : [];
    let val = getByPath(tradecard, sourcePath);
    val = applyTransforms(val, transforms);
    const { ok, reason } = validate(val, rule.constraints || {});
    if (ok && val !== '' && val !== undefined && val !== null) {
      fields[key] = String(val);
      sent_keys.add(key);
      audit.push({ key, status: 'ok', source: 'scrape', len: String(val).length });
    } else {
      dropped_empty.push(key);
      const status = reason === 'missing' ? 'skipped' : 'invalid';
      audit.push({ key, status, source: 'scrape', len: val ? String(val).length : 0 });
    }
  }

  let llmFields = {};
  if (resolve === 'llm' || (infer && sent_keys.size < 8)) {
    try {
      const llm = await resolveWithLLM({ tradecard, raw, intentDoc: doc, allowKeys: allowKeys, mode: resolve });
      llmFields = llm.fields || {};
      for (const [k, v] of Object.entries(llmFields)) {
        if (!allow.has(k)) continue;
        if (typeof v !== 'string') continue;
        const s = v.trim();
        if (!s) continue;
        fields[k] = s;
        sent_keys.add(k);
        const idx = dropped_empty.indexOf(k);
        if (idx !== -1) dropped_empty.splice(idx, 1);
        audit.push({ key: k, status: 'ok', source: 'llm', len: s.length });
      }
      trace.push({ stage: 'llm_resolve', sent: Object.keys(llmFields).length, sample_sent: Object.keys(llmFields).slice(0, 10) });
    } catch {}
  }

  const beforeCount = sent_keys.size;
  if (beforeCount < 8) {
    const defaults = [
      'identity_business_name',
      'identity_website_url',
      'identity_email',
      'identity_phone',
      'identity_logo_url',
      'social_links_facebook',
      'social_links_instagram',
      'social_links_linkedin',
      'social_links_twitter',
      'social_links_youtube',
      'social_links_tiktok',
      'social_links_pinterest',
      'business_description',
      'service_areas_csv',
      'service_1_title',
      'service_1_description',
      'service_1_image_url',
      'service_1_cta_label',
      'service_1_cta_link'
    ];
    for (const key of defaults) {
      if (!allow.has(key)) continue;
      if (fields[key] !== undefined && fields[key] !== '') continue;
      const rule = doc[key] || {};
      const sourcePath = rule.source || defaultSource(key) || key;
      const transforms = Array.isArray(rule.transforms)
        ? rule.transforms
        : rule.transforms ? [rule.transforms] : [];
      let val = getByPath(tradecard, sourcePath);
      val = applyTransforms(val, transforms);
      if (val === undefined || val === null || val === '') continue;
      fields[key] = String(val);
      sent_keys.add(key);
      const idx = dropped_empty.indexOf(key);
      if (idx !== -1) dropped_empty.splice(idx, 1);
      audit.push({ key, status: 'ok', source: 'baseline', len: String(val).length });
    }
  }

  for (const k of Object.keys(fields)) {
    if (fields[k] !== undefined && fields[k] !== null) {
      fields[k] = String(fields[k]);
    }
  }

  trace.push({ stage: 'intent_coverage', before: beforeCount, after: sent_keys.size, sample_sent: Array.from(sent_keys).slice(0, 10) });

  return { fields, sent_keys: Array.from(sent_keys), dropped_empty, dropped_unknown, audit, trace };
}

module.exports = { loadIntent, applyIntent };
