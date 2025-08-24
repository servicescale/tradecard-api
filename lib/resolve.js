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

function darkenHex(hex = '', pct = 0.1) {
  let h = String(hex).trim();
  if (!/^#?[0-9a-fA-F]{3,6}$/.test(h)) return hex;
  h = h.replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  r = Math.max(0, Math.round(r * (1 - pct)));
  g = Math.max(0, Math.round(g * (1 - pct)));
  b = Math.max(0, Math.round(b * (1 - pct)));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function deriveFields(fields = {}, { tradecard_url } = {}) {
  if (tradecard_url && !fields.trust_qr_text) {
    fields.trust_qr_text = tradecard_url;
  }
  if (fields.trust_google_review_url && !fields.trust_review_button_link) {
    fields.trust_review_button_link = fields.trust_google_review_url;
  }
  if (fields.theme_primary_color && !fields.theme_accent_color) {
    fields.theme_accent_color = darkenHex(fields.theme_primary_color, 0.1);
  }
  if (tradecard_url && !fields.trust_vcf_url) {
    try {
      const u = new URL(tradecard_url);
      const slug = u.pathname.replace(/^\//, '').replace(/\/$/, '');
      if (slug) fields.trust_vcf_url = `https://contact.tradecard.au/${slug}.vcf`;
    } catch {}
  }
}

module.exports = { similar, pickBest, deriveFields };
