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

function resolveServicePanels(src = {}) {
  const services = Array.isArray(src.service_panels) ? [...src.service_panels] : [];
  const gallery = Array.isArray(src.projects) ? src.projects : [];
  let gi = 0;
  while (services.length < 3 && gi < gallery.length) {
    const g = gallery[gi++];
    services.push({
      title: g.title,
      image_url: g.image_url,
      cta_label: g.cta_label || g.title || null,
      cta_link: g.cta_link,
      panel_tag: 'featured project',
      tags: 'featured project',
    });
  }
  const fields = {};
  for (let i = 0; i < Math.min(3, services.length); i++) {
    const svc = services[i];
    const idx = i + 1;
    for (const [key, val] of Object.entries(svc)) {
      if (val !== undefined && val !== null && val !== '') {
        fields[`service_${idx}_${key}`] = val;
      }
    }
  }
  return fields;
}

module.exports = { similar, pickBest, resolveServicePanels };
