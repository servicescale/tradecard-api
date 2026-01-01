const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// Allow international formats with spaces, dashes, dots or parentheses
const PHONE_RX = /^\+?\(?[0-9][0-9\s\-()]{7,19}$/;
const URL_RX = /^https?:\/\//i;
// Match PO Box and common AU address formats
const ADDRESS_RX = /(PO\s*Box\s*\d+[\w\s,]*\b(?:NSW|QLD|VIC|WA|SA|TAS|ACT|NT)\s*\d{4}|\d+[\w\s./-]+,\s*[A-Za-z\s]+,\s*(?:NSW|QLD|VIC|WA|SA|TAS|ACT|NT)\s*\d{4})/i;

function norm(s=''){return String(s||'').trim();}
function normUrl(u=''){const s=norm(u);if(!s||/^data:/i.test(s))return'';if(/^https?:\/\//i.test(s))return s;return s.startsWith('//')?'https:'+s:'';}
function pickHost(u=''){try{return new URL(u).hostname.replace(/^www\./,'').toLowerCase();}catch{return''}}
function firstTruthy(...c){for(const v of c){const n=norm(v);if(n)return n;}return'';}
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

function getEmail(raw = {}) {
  for (const j of getJsonLds(raw)) {
    const v = norm(j.email);
    if (EMAIL_RX.test(v)) return { value: v.toLowerCase(), source: 'jsonld' };
  }
  for (const a of raw.anchors || []) {
    const href = norm(a.href);
    if (href.toLowerCase().startsWith('mailto:')) {
      const v = href.slice(7);
      if (EMAIL_RX.test(v)) return { value: v.toLowerCase(), source: 'anchors' };
    }
  }
  const texts = [];
  for (const a of raw.anchors || []) texts.push(norm(a.text), norm(a.href));
  const heads = raw.headings;
  const arr = Array.isArray(heads) ? heads : [ ...(heads?.h1 || []), ...(heads?.h2 || []), ...(heads?.h3 || []) ];
  texts.push(...arr.map(norm));
  for (const v of Object.values(raw.meta || {})) texts.push(norm(v));
  const m = texts.join(' ').match(EMAIL_RX);
  return m ? { value: m[0].toLowerCase(), source: 'regex' } : { value: '', source: '' };
}

function getPhone(raw = {}) {
  // Scan for numbers allowing international characters, dots and extensions
  const scan = /\+?\(?[0-9][0-9\s\-.()]{7,19}(?:\s?(?:x|ext\.?|#)\s?\d{1,5})?/i;
  const normP = v => {
    v = v.replace(/\(0\)/g, '');
    v = v.replace(/\b(?:ext|x|#)\s*\d+\b/gi, '');
    v = v.replace(/[^0-9+]+/g, ' ').trim().replace(/\s+/g, ' ');
    let d = v.replace(/\s+/g, '');
    if (d.startsWith('+')) return d;
    if (d.startsWith('00')) return '+' + d.slice(2);
    if (d.startsWith('0')) return '+61' + d.slice(1);
    if (!d.startsWith('61')) return '+61' + d;
    return '+' + d;
  };
  for (const j of getJsonLds(raw)) {
    const t = norm(j['@type']);
    if (/organization|localbusiness/i.test(t)) {
      const v = normP(norm(j.telephone));
      if (PHONE_RX.test(v)) return { value: v, source: 'jsonld' };
    }
  }
  for (const a of raw.anchors || []) {
    const href = norm(a.href);
    if (href.toLowerCase().startsWith('tel:')) {
      const v = normP(href.slice(4));
      if (PHONE_RX.test(v)) return { value: v, source: 'anchors' };
    }
  }
  const texts = [];
  for (const a of raw.anchors || []) texts.push(norm(a.text), norm(a.href));
  const heads = raw.headings;
  const arr = Array.isArray(heads) ? heads : [ ...(heads?.h1 || []), ...(heads?.h2 || []), ...(heads?.h3 || []) ];
  texts.push(...arr.map(norm));
  for (const v of Object.values(raw.meta || {})) texts.push(norm(v));
  const m = texts.join(' ').match(scan);
  if (m) {
    const v = normP(m[0]);
    if (PHONE_RX.test(v)) return { value: v, source: 'regex' };
  }
  return { value: '', source: '' };
}

function getDomain(raw = {}) {
  for (const j of getJsonLds(raw)) {
    const t = norm(j['@type']);
    if (/organization|localbusiness/i.test(t)) {
      const v = normUrl(j.url);
      if (v) return { value: v, source: 'jsonld' };
    }
  }
  const host = pickHost(raw.url);
  if (host) {
    for (const a of raw.anchors || []) {
      if (pickHost(normUrl(a.href)) === host) return { value: 'https://' + host, source: 'anchors' };
    }
  }
  const meta = raw.meta || {};
  const m = normUrl(meta['og:url']);
  if (m) return { value: m, source: 'meta' };
  if (host) return { value: 'https://' + host, source: 'url' };
  return { value: '', source: '' };
}

function getBusinessName(raw={}){
  for(const j of getJsonLds(raw)){
    const t=norm(j['@type']);
    if(/organization|localbusiness/i.test(t)){
      const v=norm(j.name);
      if(v) return { value:v, source:'jsonld' };
    }
  }
  const m=norm((raw.meta||{})['og:site_name']);
  if(m) return { value:m, source:'meta' };
  const heads=raw.headings;
  const arr=Array.isArray(heads)?heads:[...(heads?.h1||[]),...(heads?.h2||[])];
  for(const t of arr){
    const v=norm(t);
    if(/[a-zA-Z]{3}/.test(v)) return { value:v, source:'headings' };
  }
  return { value:'', source:'' };
}

function getLogoUrl(raw={}){
  for(const j of getJsonLds(raw)){
    const t=norm(j['@type']);
    if(/organization|localbusiness/i.test(t)){
      const v=normUrl(firstTruthy(j.logo?.url,j.logo));
      if(v) return { value:v, source:'jsonld' };
    }
  }
  const meta=raw.meta||{};
  const m=normUrl(meta['og:image']);
  if(m) return { value:m, source:'meta' };
  const icon=normUrl(meta.icon||meta['link:icon']);
  if(icon) return { value:icon, source:'meta' };
  for(const u of raw.images||[]){
    const v=normUrl(u);
    if(v&&/\/logo/i.test(v)) return { value:v, source:'images' };
  }
  return { value:'', source:'' };
}

function getAddress(raw={}){
  for(const j of getJsonLds(raw)){
    const a=j.address;
    if(typeof a==='string'){
      const v=norm(a);
      if(ADDRESS_RX.test(v)) return { value:v, source:'jsonld' };
    }else if(a && typeof a==='object'){
      const parts=[a.streetAddress,a.addressLocality,a.addressRegion,a.postalCode].filter(Boolean);
      const v=norm(parts.join(', '));
      if(ADDRESS_RX.test(v)) return { value:v, source:'jsonld' };
    }
  }
  if(raw.identity_address){
    const v=norm(raw.identity_address);
    if(ADDRESS_RX.test(v)) return { value:v, source:'identity' };
  }
  const texts=[];
  const heads=raw.headings;
  const arr=Array.isArray(heads)?heads:[...(heads?.h1||[]),...(heads?.h2||[]),...(heads?.h3||[]),...(heads?.h4||[]),...(heads?.h5||[]),...(heads?.h6||[])];
  texts.push(...arr.map(norm));
  for(const a of raw.anchors||[]) texts.push(norm(a.text),norm(a.href));
  for(const v of Object.values(raw.meta||{})) texts.push(norm(v));
  const m=texts.join(' ').match(ADDRESS_RX);
  return m?{ value:norm(m[0]), source:'regex' }:{ value:'', source:'' };
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

function getSocials(raw = {}) {
  const out = {};
  const add = (url, source) => {
    const u = normUrl(url);
    if (!u) return;
    const host = pickHost(u);
    for (const [key, domains] of Object.entries(SOCIAL_DOMAINS)) {
      if (out[key]?.value) continue;
      if (domains.some(d => host === d || host.endsWith('.' + d))) {
        out[key] = { value: u, source };
        return;
      }
    }
  };
  for (const j of getJsonLds(raw)) {
    const t = norm(j['@type']);
    if (/organization|localbusiness/i.test(t)) {
      const same = j.sameAs;
      if (Array.isArray(same)) for (const u of same) add(u, 'jsonld');
    }
  }
  for (const a of raw.anchors || []) add(a.href, 'anchors');
  return out;
}

module.exports = {
  getEmail,
  getPhone,
  getDomain,
  getBusinessName,
  getLogoUrl,
  getAddress,
  getSocials,
  EMAIL_RX,
  PHONE_RX,
  URL_RX,
  ADDRESS_RX
};
