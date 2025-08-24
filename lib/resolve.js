// lib/resolve.js
// Utilities for resolving LLM output into TradeCard fields.

function normalize(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .join(' ');
}

function trigrams(str = '') {
  const out = new Set();
  for (let i = 0; i < str.length - 2; i++) {
    out.add(str.slice(i, i + 3));
  }
  return out;
}

function similar(a = '', b = '') {
  const sa = normalize(a);
  const sb = normalize(b);
  if (!sa || !sb) return 0;
  const ta = trigrams(sa);
  const tb = trigrams(sb);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

function pickBest(candidates = {}, targetKey = '', { min = 0.68 } = {}) {
  let bestKey;
  let bestScore = 0;
  let bestVal;
  for (const [key, val] of Object.entries(candidates)) {
    const score = similar(key, targetKey);
    if (score > bestScore) {
      bestKey = key;
      bestScore = score;
      bestVal = val;
    }
  }
  if (!bestVal || bestScore < min) {
    return { value: undefined, confidence: 0, matched: undefined };
  }
  const value = bestVal && typeof bestVal === 'object' && 'value' in bestVal ? bestVal.value : bestVal;
  const baseConf = bestVal && typeof bestVal === 'object' && typeof bestVal.confidence === 'number' ? bestVal.confidence : 0.5;
  return { value, confidence: baseConf * bestScore, matched: bestKey };
}

function resolveIdentity(parsed = {}) {
  const out = {};

  const copy = (key) => {
    if (parsed[key]) out[key] = parsed[key];
  };

  [
    'identity_owner_name',
    'identity_role_title',
    'identity_headshot_url',
    'identity_suburb',
    'identity_state',
    'identity_abn',
    'identity_insured',
    'identity_address',
    'identity_email',
    'identity_phone',
    'identity_website_url',
    'identity_uri_phone',
    'identity_uri_email',
    'identity_uri_sms',
    'identity_uri_whatsapp',
    'identity_address_uri'
  ].forEach(copy);

  if (Array.isArray(parsed.identity_services)) {
    out.identity_services = parsed.identity_services
      .map((s) => `<div class="tag">${s}</div>`)
      .join('');
  }

  if (parsed.identity_website_url && !out.identity_website) {
    try {
      const u = new URL(parsed.identity_website_url);
      out.identity_website = u.hostname.replace(/^www\./, '');
      out.identity_website_url = u.toString();
    } catch {
      out.identity_website = parsed.identity_website_url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    }
  }

  if (!out.identity_address_uri && parsed.identity_address) {
    out.identity_address_uri =
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsed.identity_address)}`;
  }

  return out;
}

module.exports = { similar, pickBest, resolveIdentity };
