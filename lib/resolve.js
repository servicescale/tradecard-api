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

function deriveSourceLabel(url = '') {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('google')) return 'Google';
    if (host.includes('facebook')) return 'Facebook';
    if (host.includes('yelp')) return 'Yelp';
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('linkedin')) return 'LinkedIn';
    if (host.includes('trustpilot')) return 'Trustpilot';
    const base = host.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return undefined;
  }
}

function resolveTestimonial(site = [], gmb = []) {
  const pick = (arr) => {
    if (!Array.isArray(arr)) return null;
    const obj = arr.find((t) => t && (typeof t === 'string' ? t.trim() : t.quote));
    if (!obj) return null;
    if (typeof obj === 'string') return { quote: obj };
    const out = {
      quote: obj.quote || obj.text || null,
      reviewer: obj.reviewer || obj.name || null,
      location: obj.location || null,
      source_label: obj.source_label || null,
      source_url: obj.source_url || null,
      job_type: obj.job_type || null,
    };
    if (!out.source_label && out.source_url) {
      out.source_label = deriveSourceLabel(out.source_url) || null;
    }
    return out;
  };
  return pick(site) || pick(gmb) || {};
}

module.exports = { similar, pickBest, resolveTestimonial, deriveSourceLabel };
