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

function levenshtein(a = '', b = '') {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similar(a = '', b = '') {
  const sa = normalize(a);
  const sb = normalize(b);
  if (!sa || !sb) return 0;

  // Trigram similarity for longer strings
  const ta = trigrams(sa);
  const tb = trigrams(sb);
  let triScore = 0;
  if (ta.size > 0 && tb.size > 0) {
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    const union = ta.size + tb.size - inter;
    triScore = union ? inter / union : 0;
  }

  // Token based similarity helps for short strings
  const tokensA = new Set(sa.split(' '));
  const tokensB = new Set(sb.split(' '));
  let tokenInter = 0;
  for (const t of tokensA) if (tokensB.has(t)) tokenInter++;
  const tokenUnion = tokensA.size + tokensB.size - tokenInter;
  const tokenScore = tokenUnion ? tokenInter / tokenUnion : 0;

  // Levenshtein distance helps catch small typos/transpositions
  const levDist = levenshtein(sa, sb);
  const levScore = 1 - levDist / Math.max(sa.length, sb.length);

  return Math.max(triScore, tokenScore, levScore);
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
  const baseConf =
    bestVal && typeof bestVal === 'object' && typeof bestVal.confidence === 'number'
      ? bestVal.confidence
      : 0.5;
  const confidence = baseConf + (1 - baseConf) * bestScore;
  return { value, confidence, matched: bestKey };
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

function cleanSocialUrl(url = '', platform = '') {
  try {
    const u = new URL(String(url));
    u.protocol = 'https:';
    u.hash = '';
    // Strip tracking or locale parameters
    const stripParams = ['fbclid', 'ref', 'ref_src', 'lang', 'locale'];
    for (const key of Array.from(u.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || stripParams.includes(lower)) {
        u.searchParams.delete(key);
      }
    }
    // Collapse common mobile subdomains to canonical hosts
    let host = u.hostname.toLowerCase().replace(/^(m|mobile|www)\./, '');
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

function resolveIdentity(parsed = {}) {
  const out = {};

  const copy = (key) => {
    if (parsed[key]) out[key] = parsed[key];
  };

  [
    'identity_owner_name',
    'identity_role_title',
    'identity_headshot_url',
    'identity_logo_url',
    'identity_suburb',
    'identity_state',
    'identity_abn',
    'identity_insured',
    'identity_business_type',
    'identity_business_name',
    'identity_location_label',
    'identity_address',
    'identity_email',
    'identity_phone',
    'identity_website',
    'identity_website_url',
    'identity_uri_phone',
    'identity_uri_email',
    'identity_uri_sms',
    'identity_uri_whatsapp',
    'identity_address_uri',
    'identity_display_name',
    'identity_verified'
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

  if (!out.identity_display_name) {
    if (out.identity_owner_name) {
      out.identity_display_name = out.identity_owner_name;
    } else if (out.identity_business_name) {
      out.identity_display_name = out.identity_business_name;
    }
  }

  if (!out.identity_verified && out.identity_abn && out.identity_owner_name && out.identity_phone) {
    out.identity_verified = 'true';
  }

  return out;
}

function normalizePhone(p = '') {
  let digits = String(p).replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = '61' + digits.slice(1);
  if (!digits.startsWith('61')) digits = '61' + digits;
  return '+' + digits;
}

function metadataPass(raw = {}) {
  const out = {};
  if (raw.identity_owner_name) out.identity_owner_name = String(raw.identity_owner_name).trim();
  if (raw.meta?.canonical) out.identity_website_url = raw.meta.canonical;
  if (raw.meta?.['og:image']) out.identity_logo_url = raw.meta['og:image'];
  return out;
}

function entityPass(raw = {}) {
  const out = {};
  for (const a of raw.anchors || []) {
    const href = a.href || '';
    if (!out.identity_email && href.startsWith('mailto:')) {
      out.identity_email = href.slice(7).trim().toLowerCase();
    }
    if (!out.identity_phone && href.startsWith('tel:')) {
      out.identity_phone = normalizePhone(href.slice(4));
    }
  }
  return out;
}

function relationshipPass(raw = {}) {
  const out = {};
  for (const a of raw.anchors || []) {
    const href = a.href || '';
    if (!out.social_links_facebook && /facebook\.com/i.test(href)) {
      out.social_links_facebook = cleanSocialUrl(href, 'facebook') || href;
    }
  }
  return out;
}

const { computeCoverage } = require('./coverage.ts');

function resolvePasses(raw = {}, allow = []) {
  const allowSet = new Set(allow);
  const fields = {};
  const trace = [];
  let unresolved = new Set(allow);

  const passes = [
    ['metadata', metadataPass],
    ['entities', entityPass],
    ['relationships', relationshipPass],
  ];

  for (const [stage, fn] of passes) {
    const newFields = fn(raw, fields);
    Object.assign(fields, newFields);
    unresolved = new Set([...allowSet].filter((k) => fields[k] === undefined || fields[k] === null || fields[k] === ''));
    const coverage = computeCoverage(fields, allowSet);
    trace.push({ stage, unresolved: Array.from(unresolved), coverage });
  }

  return { fields, trace };
}

module.exports = {
  similar,
  pickBest,
  deriveFields,
  deriveSourceLabel,
  resolveTestimonial,
  resolveServicePanels,
  cleanSocialUrl,
  resolveSocialLinks,
  resolveIdentity,
  resolvePasses,
};

