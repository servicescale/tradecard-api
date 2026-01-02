const { URL } = require('node:url');

const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const EMAIL_GLOBAL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_SCAN_RX = /\+?\d[\d\s().-]{7,}/g;
const URL_RX = /^https?:\/\//i;
const ADDRESS_RX = /(PO\s*Box\s*\d+[\w\s,]*\b(?:NSW|QLD|VIC|WA|SA|TAS|ACT|NT)\s*\d{4}|\d+[\w\s./-]+,\s*[A-Za-z\s]+,\s*(?:NSW|QLD|VIC|WA|SA|TAS|ACT|NT)\s*\d{4})/i;

const AU_STATE_MAP = {
  NSW: ['NSW', 'New South Wales'],
  QLD: ['QLD', 'Queensland'],
  VIC: ['VIC', 'Victoria'],
  WA: ['WA', 'Western Australia'],
  SA: ['SA', 'South Australia'],
  TAS: ['TAS', 'Tasmania'],
  ACT: ['ACT', 'Australian Capital Territory'],
  NT: ['NT', 'Northern Territory']
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);

function norm(value) {
  return String(value || '').trim();
}

function uniqPush(list, seen, value) {
  const v = norm(value);
  if (!v || seen.has(v)) return;
  seen.add(v);
  list.push(v);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function collectHeadings(raw = {}) {
  if (Array.isArray(raw.headings)) return raw.headings.map((h) => norm(h?.text || h));
  if (raw.headings && typeof raw.headings === 'object') {
    const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    const out = [];
    for (const level of levels) out.push(...asArray(raw.headings[level]).map((h) => norm(h)));
    return out.filter(Boolean);
  }
  return [];
}

function parseJsonLd(raw = {}) {
  const out = [];
  for (const entry of asArray(raw.jsonld)) {
    if (entry && typeof entry === 'object') {
      out.push(entry);
      continue;
    }
    if (typeof entry === 'string') {
      try {
        const parsed = JSON.parse(entry);
        if (parsed && typeof parsed === 'object') out.push(parsed);
      } catch {
        continue;
      }
    }
  }
  return out;
}

function extractEmails({ anchors = [], texts = [] } = {}) {
  const list = [];
  const seen = new Set();
  for (const anchor of anchors) {
    const href = norm(anchor?.href);
    if (href.toLowerCase().startsWith('mailto:')) {
      const addr = href.slice(7).split('?')[0];
      if (EMAIL_RX.test(addr)) uniqPush(list, seen, addr.toLowerCase());
    }
  }
  for (const text of texts) {
    const matches = text.match(EMAIL_GLOBAL_RX);
    if (!matches) continue;
    for (const match of matches) {
      uniqPush(list, seen, match.toLowerCase());
    }
  }
  return list;
}

function normalizeAuPhone(value) {
  const digits = norm(value).replace(/[^0-9]/g, '');
  if (!digits) return '';
  let normalized = digits;
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  if (normalized.startsWith('0')) normalized = `61${normalized.slice(1)}`;
  if (!normalized.startsWith('61')) return '';
  if (normalized.length !== 11) return '';
  return `+${normalized}`;
}

function extractPhones({ anchors = [], texts = [] } = {}) {
  const list = [];
  const seen = new Set();
  for (const anchor of anchors) {
    const href = norm(anchor?.href);
    if (href.toLowerCase().startsWith('tel:')) {
      const num = normalizeAuPhone(href.slice(4));
      if (num) uniqPush(list, seen, num);
    }
  }
  for (const text of texts) {
    const matches = text.match(PHONE_SCAN_RX);
    if (!matches) continue;
    for (const match of matches) {
      const num = normalizeAuPhone(match);
      if (num) uniqPush(list, seen, num);
    }
  }
  return list;
}

function normalizeUrl(value) {
  const v = norm(value);
  if (!URL_RX.test(v)) return '';
  return v;
}

function extractUrls({ anchors = [], meta = {}, jsonld = [], rawUrl = '' } = {}) {
  const list = [];
  const seen = new Set();
  for (const anchor of anchors) {
    const href = normalizeUrl(anchor?.href);
    if (href) uniqPush(list, seen, href);
  }
  uniqPush(list, seen, normalizeUrl(meta.canonical));
  uniqPush(list, seen, normalizeUrl(meta['og:url']));
  uniqPush(list, seen, normalizeUrl(rawUrl));
  for (const obj of jsonld) {
    uniqPush(list, seen, normalizeUrl(obj?.url));
  }
  return list;
}

function extractImageUrls({ images = [], meta = {}, jsonld = [] } = {}) {
  const list = [];
  const seen = new Set();
  for (const img of images) {
    uniqPush(list, seen, normalizeUrl(img?.src || img));
  }
  uniqPush(list, seen, normalizeUrl(meta['og:image']));
  for (const obj of jsonld) {
    uniqPush(list, seen, normalizeUrl(obj?.logo?.url || obj?.logo));
    uniqPush(list, seen, normalizeUrl(obj?.image?.url || obj?.image));
  }
  return list.filter(Boolean);
}

function extractAddressFromJsonLd(obj) {
  if (!obj) return { address: '', suburb: '', state: '' };
  const address = obj.address;
  if (typeof address === 'string') {
    return { address: norm(address), suburb: '', state: '' };
  }
  if (address && typeof address === 'object') {
    const parts = [
      norm(address.streetAddress),
      norm(address.addressLocality),
      norm(address.addressRegion),
      norm(address.postalCode)
    ].filter(Boolean);
    return {
      address: parts.join(', '),
      suburb: norm(address.addressLocality),
      state: norm(address.addressRegion)
    };
  }
  return { address: '', suburb: '', state: '' };
}

function extractAddresses({ jsonld = [], rawAddress = '', texts = [] } = {}) {
  const list = [];
  const seen = new Set();
  const suburbs = [];
  const suburbSeen = new Set();
  const states = [];
  const stateSeen = new Set();

  for (const obj of jsonld) {
    const { address, suburb, state } = extractAddressFromJsonLd(obj);
    if (address) uniqPush(list, seen, address);
    if (suburb) uniqPush(suburbs, suburbSeen, suburb);
    if (state) uniqPush(states, stateSeen, state);
  }

  if (rawAddress) uniqPush(list, seen, rawAddress);

  for (const text of texts) {
    const matches = text.match(new RegExp(ADDRESS_RX, 'gi'));
    if (!matches) continue;
    for (const match of matches) {
      uniqPush(list, seen, match);
    }
  }

  return { addresses: list, suburbs, states };
}

function normalizeState(value) {
  const v = norm(value);
  if (!v) return '';
  for (const [code, variants] of Object.entries(AU_STATE_MAP)) {
    if (variants.some((variant) => variant.toLowerCase() === v.toLowerCase())) return code;
  }
  return '';
}

function deriveStates(addresses = [], rawStates = []) {
  const list = [];
  const seen = new Set();
  for (const state of rawStates) {
    const normalized = normalizeState(state);
    if (normalized) uniqPush(list, seen, normalized);
  }
  for (const addr of addresses) {
    for (const [code, variants] of Object.entries(AU_STATE_MAP)) {
      for (const variant of variants) {
        const rx = new RegExp(`\\b${variant.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (rx.test(addr)) {
          uniqPush(list, seen, code);
          break;
        }
      }
    }
  }
  return list;
}

function deriveSuburbs(addresses = [], rawSuburbs = []) {
  const list = [];
  const seen = new Set();
  for (const suburb of rawSuburbs) {
    if (/[A-Za-z]/.test(suburb)) uniqPush(list, seen, suburb);
  }
  for (const addr of addresses) {
    const parts = addr.split(',').map((part) => norm(part)).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 2];
      if (/[A-Za-z]/.test(candidate) && !/\d/.test(candidate)) {
        uniqPush(list, seen, candidate);
      }
    }
  }
  return list;
}

function extractContactUris(anchors = []) {
  const buckets = {
    uri_email: [],
    uri_phone: [],
    uri_sms: [],
    uri_whatsapp: [],
    address_uris: []
  };
  const seen = {
    uri_email: new Set(),
    uri_phone: new Set(),
    uri_sms: new Set(),
    uri_whatsapp: new Set(),
    address_uris: new Set()
  };
  for (const anchor of anchors) {
    const href = norm(anchor?.href);
    const low = href.toLowerCase();
    if (low.startsWith('mailto:')) {
      const addr = href.slice(7).split('?')[0];
      if (EMAIL_RX.test(addr)) uniqPush(buckets.uri_email, seen.uri_email, `mailto:${addr.toLowerCase()}`);
    }
    if (low.startsWith('tel:')) {
      const num = normalizeAuPhone(href.slice(4));
      if (num) uniqPush(buckets.uri_phone, seen.uri_phone, `tel:${num}`);
    }
    if (low.startsWith('sms:')) {
      const num = normalizeAuPhone(href.slice(4));
      if (num) uniqPush(buckets.uri_sms, seen.uri_sms, `sms:${num}`);
    }
    if (low.includes('wa.me') || low.includes('whatsapp')) {
      uniqPush(buckets.uri_whatsapp, seen.uri_whatsapp, href);
    }
    if (/google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(low)) {
      uniqPush(buckets.address_uris, seen.address_uris, href);
    }
  }
  return buckets;
}

function extractBusinessNames({ jsonld = [], meta = {}, headings = [] } = {}) {
  const list = [];
  const seen = new Set();
  for (const obj of jsonld) {
    uniqPush(list, seen, obj?.name);
  }
  uniqPush(list, seen, meta['og:site_name']);
  uniqPush(list, seen, meta.title);
  for (const heading of headings) uniqPush(list, seen, heading);
  return list;
}

function extractSignals(raw = {}) {
  const anchors = asArray(raw.anchors);
  const headings = collectHeadings(raw);
  const textBlocks = asArray(raw.text_blocks).map((t) => norm(t)).filter(Boolean);
  const meta = raw.meta || {};
  const jsonld = parseJsonLd(raw);

  const textSources = [
    ...headings,
    ...textBlocks,
    ...anchors.map((a) => norm(a?.text)),
    ...anchors.map((a) => norm(a?.href)),
    ...Object.values(meta).map((v) => norm(v))
  ].filter(Boolean);

  const emails = extractEmails({ anchors, texts: textSources });
  const phones = extractPhones({ anchors, texts: textSources });
  const urls = extractUrls({ anchors, meta, jsonld, rawUrl: raw.url });
  const imageUrls = extractImageUrls({ images: asArray(raw.images), meta, jsonld });
  const addressResult = extractAddresses({ jsonld, rawAddress: raw.identity_address, texts: textSources });
  const states = deriveStates(addressResult.addresses, addressResult.states);
  const suburbs = deriveSuburbs(addressResult.addresses, addressResult.suburbs);
  const contactUris = extractContactUris(anchors);
  const businessNames = extractBusinessNames({ jsonld, meta, headings });

  return {
    emails,
    phones,
    urls,
    image_urls: imageUrls,
    addresses: addressResult.addresses,
    states,
    suburbs,
    headings,
    text_blocks: textBlocks,
    jsonld,
    business_names: businessNames,
    ...contactUris
  };
}

function matchesConstraints(value, constraints = {}, fieldKey = '') {
  const s = norm(value);
  if (!s) return false;
  if (constraints.allowed_values && !constraints.allowed_values.includes(value)) return false;
  if (constraints.regex && !(new RegExp(constraints.regex)).test(s)) return false;

  const minLen = constraints.min_length ?? constraints.min_len;
  const maxLen = constraints.max_length ?? constraints.max_len;
  if (minLen != null && s.length < minLen) return false;
  if (maxLen != null && s.length > maxLen) return false;

  const minWords = constraints.min_words;
  const maxWords = constraints.max_words;
  if (minWords != null || maxWords != null) {
    const wc = s.split(/\s+/).filter(Boolean).length;
    if (minWords != null && wc < minWords) return false;
    if (maxWords != null && wc > maxWords) return false;
  }

  if (constraints.format === 'email' && !EMAIL_RX.test(s)) return false;
  if (constraints.format === 'url' && !URL_RX.test(s)) return false;

  if (constraints.must_be_image || constraints.allowed_extensions) {
    const allowed = new Set((constraints.allowed_extensions || []).map((ext) => ext.toLowerCase()));
    const ext = (() => {
      try {
        const url = new URL(s);
        const path = url.pathname.toLowerCase();
        return path.slice(path.lastIndexOf('.'));
      } catch {
        return '';
      }
    })();
    const validExt = ext && (allowed.size ? allowed.has(ext) : IMAGE_EXTENSIONS.has(ext));
    if (!validExt) return false;
  }

  if (fieldKey === 'identity_phone' && !normalizeAuPhone(s)) return false;
  if (fieldKey === 'identity_state' && !normalizeState(s)) return false;

  return true;
}

const FIELD_BUCKETS = {
  identity_email: ['emails'],
  identity_phone: ['phones'],
  identity_state: ['states'],
  identity_suburb: ['suburbs'],
  identity_address: ['addresses'],
  identity_business_name: ['business_names'],
  identity_website: ['urls'],
  identity_website_url: ['urls'],
  identity_logo_url: ['image_urls'],
  identity_headshot_url: ['image_urls'],
  identity_uri_phone: ['uri_phone'],
  identity_uri_email: ['uri_email'],
  identity_uri_sms: ['uri_sms'],
  identity_uri_whatsapp: ['uri_whatsapp'],
  identity_address_uri: ['address_uris']
};

function resolveField(key, signals, rule = {}) {
  if (key === 'identity_abn') return null;
  const buckets = FIELD_BUCKETS[key];
  if (!buckets) return null;
  for (const bucket of buckets) {
    const candidates = signals[bucket] || [];
    for (const candidate of candidates) {
      if (!matchesConstraints(candidate, rule.constraints || {}, key)) continue;
      if (key === 'identity_state') return normalizeState(candidate);
      if (key === 'identity_phone') return normalizeAuPhone(candidate);
      return candidate;
    }
  }
  return null;
}

function resolveFields(signals, map = {}, allowSet = new Set()) {
  const fields = {};
  for (const key of allowSet) fields[key] = null;
  for (const [key, rule] of Object.entries(map)) {
    if (!allowSet.has(key)) continue;
    fields[key] = resolveField(key, signals, rule);
  }
  return fields;
}

function resolveFromRaw(raw = {}, { allowSet = new Set(), map = {} } = {}) {
  const signals = extractSignals(raw);
  const fields = resolveFields(signals, map, allowSet);
  return { fields, signals };
}

module.exports = {
  extractSignals,
  resolveFields,
  resolveFromRaw
};
