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

function cleanSocialUrl(url = '', platform = '') {
  try {
    const u = new URL(String(url));
    u.protocol = 'https:';
    u.hash = '';
    for (const key of Array.from(u.searchParams.keys())) {
      if (key.startsWith('utm_') || key === 'fbclid') u.searchParams.delete(key);
    }
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase().replace(/\/+$/, '');
    const search = u.searchParams.toString().toLowerCase();
    const out = `https://${host}${path}${search ? `?${search}` : ''}`;
    const checks = {
      facebook: /facebook\.com/,
      instagram: /instagram\.com/,
      linkedin: /linkedin\.com/,
      pinterest: /pinterest\.com/,
      tiktok: /tiktok\.com/,
      twitter: /(x\.com|twitter\.com)/,
      youtube: /(youtube\.com|youtu\.be)/
    };
    if (platform && checks[platform] && !checks[platform].test(out)) return null;
    return out;
  } catch {
    return null;
  }
}

function resolveSocialLinks(parsed = [], gmb_lookup = {}) {
  const platforms = ['facebook', 'instagram', 'linkedin', 'pinterest', 'tiktok', 'twitter', 'youtube'];
  const out = {};
  const byPlat = new Map();
  if (Array.isArray(parsed)) {
    for (const s of parsed) {
      const plat = String(s?.platform || '').toLowerCase();
      const url = typeof s?.url === 'string' ? s.url.trim() : '';
      if (!plat || !url || byPlat.has(plat)) continue;
      byPlat.set(plat, url);
    }
  }
  for (const plat of platforms) {
    let url = byPlat.get(plat) || gmb_lookup[`social_links_${plat}`];
    if (!url) continue;
    const clean = cleanSocialUrl(url, plat);
    if (clean) out[`social_links_${plat}`] = clean;
  }
  return out;
}

module.exports = { similar, pickBest, resolveSocialLinks };
