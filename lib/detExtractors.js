const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RX = /^\+?[0-9 ][0-9 \-]{7,19}$/;
const URL_RX = /^https?:\/\//i;
const ABN_RX = /\b(?:\d\s*){11}\b/;

function norm(s=''){ return String(s||'').trim(); }
function safeJson(obj){
  if (typeof obj === 'string') { try { return JSON.parse(obj); } catch { return undefined; } }
  if (obj && typeof obj === 'object') return obj;
  return undefined;
}
function getJsonLds(raw={}){
  const arr = [];
  for (const j of raw.jsonld || []) {
    const obj = safeJson(j);
    if (obj && typeof obj === 'object') arr.push(obj);
  }
  return arr;
}

function getEmail(raw={}){
  for (const a of raw.anchors || []) {
    const href = norm(a.href);
    if (href.startsWith('mailto:')) {
      const v = href.slice(7);
      if (EMAIL_RX.test(v)) return { value: v.toLowerCase(), source: 'anchors' };
    }
    const m = href.match(EMAIL_RX) || norm(a.text).match(EMAIL_RX);
    if (m) return { value: m[0].toLowerCase(), source: 'anchors' };
  }
  for (const j of getJsonLds(raw)) {
    const v = norm(j.email);
    if (EMAIL_RX.test(v)) return { value: v.toLowerCase(), source: 'jsonld' };
  }
  return { value: '', source: '' };
}

function getPhone(raw={}){
  for (const a of raw.anchors || []) {
    const href = norm(a.href);
    if (href.startsWith('tel:')) {
      const v = href.slice(4);
      if (PHONE_RX.test(v)) return { value: v, source: 'anchors' };
    }
    const m = href.match(PHONE_RX) || norm(a.text).match(PHONE_RX);
    if (m) return { value: m[0], source: 'anchors' };
  }
  for (const j of getJsonLds(raw)) {
    const v = norm(j.telephone);
    if (PHONE_RX.test(v)) return { value: v, source: 'jsonld' };
  }
  return { value: '', source: '' };
}

function getDomain(raw={}){
  const meta = raw.meta || {};
  const c = norm(meta.canonical || meta['og:url']);
  if (URL_RX.test(c)) return { value: c, source: 'meta' };
  for (const j of getJsonLds(raw)) {
    const v = norm(j.url);
    if (URL_RX.test(v)) return { value: v, source: 'jsonld' };
  }
  return { value: '', source: '' };
}

function getBusinessName(raw={}){
  for (const j of getJsonLds(raw)) {
    const t = norm(j['@type']);
    if (/organization|localbusiness/i.test(t)) {
      const v = norm(j.name);
      if (v) return { value: v, source: 'jsonld' };
    }
  }
  const meta = raw.meta || {};
  const m = norm(meta['og:site_name'] || meta['og:title']);
  if (m) return { value: m, source: 'meta' };
  const h = raw.headings || [];
  if (h[0] && norm(h[0].text)) return { value: norm(h[0].text), source: 'headings' };
  return { value: '', source: '' };
}

function getLogoUrl(raw={}){
  for (const j of getJsonLds(raw)) {
    const v = norm(j.logo?.url || j.logo);
    if (URL_RX.test(v)) return { value: v, source: 'jsonld' };
  }
  const meta = raw.meta || {};
  const m = norm(meta['og:logo'] || meta['og:image']);
  if (URL_RX.test(m)) return { value: m, source: 'meta' };
  for (const img of raw.images || []) {
    const alt = norm(img.alt).toLowerCase();
    if (/logo|brand|icon/.test(alt)) {
      const v = norm(img.src);
      if (URL_RX.test(v)) return { value: v, source: 'images' };
    }
  }
  return { value: '', source: '' };
}

function getABN(raw={}){
  const texts = [];
  for (const h of raw.headings || []) texts.push(norm(h.text));
  for (const a of raw.anchors || []) { texts.push(norm(a.text)); texts.push(norm(a.href)); }
  const meta = raw.meta || {};
  for (const v of Object.values(meta)) texts.push(norm(v));
  const joined = texts.join(' ');
  const m = joined.match(ABN_RX);
  return m ? { value: m[0].replace(/\s+/g,''), source: 'regex' } : { value: '', source: '' };
}

const SOCIAL_DOMAINS = {
  social_links_facebook: ['facebook.com'],
  social_links_instagram: ['instagram.com'],
  social_links_linkedin: ['linkedin.com'],
  social_links_twitter: ['twitter.com','x.com'],
  social_links_youtube: ['youtube.com','youtu.be'],
  social_links_tiktok: ['tiktok.com'],
  social_links_pinterest: ['pinterest.com']
};

function getSocials(raw={}){
  const out = {};
  const add = (url, source) => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./,'').toLowerCase();
      for (const [key, domains] of Object.entries(SOCIAL_DOMAINS)) {
        if (out[key]?.value) continue;
        for (const d of domains) {
          if (host === d || host.endsWith('.'+d)) {
            out[key] = { value: url, source };
            return;
          }
        }
      }
    } catch {}
  };
  for (const a of raw.anchors || []) {
    const href = norm(a.href);
    if (URL_RX.test(href)) add(href, 'anchors');
  }
  for (const j of getJsonLds(raw)) {
    const same = j.sameAs;
    if (Array.isArray(same)) {
      for (const u of same) add(norm(u), 'jsonld');
    }
  }
  return out;
}

module.exports = {
  getEmail,
  getPhone,
  getDomain,
  getBusinessName,
  getLogoUrl,
  getABN,
  getSocials,
  EMAIL_RX,
  PHONE_RX,
  URL_RX,
  ABN_RX
};
