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

const COUNTRY_MAP = {
  AU: ['Australia', 'AU', 'AUS']
};

const STOPWORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'with',
  'by', 'at', 'from', 'your', 'our', 'we', 'you', 'service', 'services'
]);

function norm(value) {
  return String(value || '').trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function uniqPush(list, seen, value) {
  const v = norm(value);
  if (!v || seen.has(v)) return;
  seen.add(v);
  list.push(v);
}

function collectHeadings(raw = {}) {
  if (Array.isArray(raw.headings)) return raw.headings.map((h) => norm(h?.text || h)).filter(Boolean);
  if (raw.headings && typeof raw.headings === 'object') {
    const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    const out = [];
    for (const level of levels) out.push(...asArray(raw.headings[level]).map((h) => norm(h)));
    return out.filter(Boolean);
  }
  return [];
}

function collectTextBlocks(raw = {}) {
  return asArray(raw.text_blocks).map((t) => norm(t)).filter(Boolean);
}

function collectLists(raw = {}) {
  const lists = [];
  const rawLists = asArray(raw.lists);
  for (const entry of rawLists) {
    if (Array.isArray(entry)) {
      for (const item of entry) lists.push(norm(item));
    } else if (entry && typeof entry === 'object') {
      for (const item of asArray(entry.items)) lists.push(norm(item));
    } else {
      lists.push(norm(entry));
    }
  }
  return lists.filter(Boolean);
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

function extractAddressFromJsonLd(obj) {
  if (!obj) return { address: '', suburb: '', state: '', country: '' };
  const address = obj.address;
  if (typeof address === 'string') {
    return { address: norm(address), suburb: '', state: '', country: '' };
  }
  if (address && typeof address === 'object') {
    const parts = [
      norm(address.streetAddress),
      norm(address.addressLocality),
      norm(address.addressRegion),
      norm(address.postalCode),
      norm(address.addressCountry)
    ].filter(Boolean);
    return {
      address: parts.join(', '),
      suburb: norm(address.addressLocality),
      state: norm(address.addressRegion),
      country: norm(address.addressCountry)
    };
  }
  return { address: '', suburb: '', state: '', country: '' };
}

function extractAddresses({ jsonld = [], rawAddress = '', texts = [] } = {}) {
  const list = [];
  const seen = new Set();
  const suburbs = [];
  const suburbSeen = new Set();
  const states = [];
  const stateSeen = new Set();
  const countries = [];
  const countrySeen = new Set();

  for (const obj of jsonld) {
    const { address, suburb, state, country } = extractAddressFromJsonLd(obj);
    if (address) uniqPush(list, seen, address);
    if (suburb) uniqPush(suburbs, suburbSeen, suburb);
    if (state) uniqPush(states, stateSeen, state);
    if (country) uniqPush(countries, countrySeen, country);
  }

  if (rawAddress) uniqPush(list, seen, rawAddress);

  for (const text of texts) {
    const matches = text.match(new RegExp(ADDRESS_RX, 'gi'));
    if (!matches) continue;
    for (const match of matches) {
      uniqPush(list, seen, match);
    }
  }

  return { addresses: list, suburbs, states, countries };
}

function normalizeState(value) {
  const v = norm(value);
  if (!v) return '';
  for (const [code, variants] of Object.entries(AU_STATE_MAP)) {
    if (variants.some((variant) => variant.toLowerCase() === v.toLowerCase())) return code;
  }
  return '';
}

function normalizeCountry(value) {
  const v = norm(value);
  if (!v) return '';
  for (const [code, variants] of Object.entries(COUNTRY_MAP)) {
    if (variants.some((variant) => variant.toLowerCase() === v.toLowerCase())) return code;
  }
  return '';
}

function extractGeoSignals({ addresses = [], rawStates = [], rawCountries = [], texts = [] } = {}) {
  const states = [];
  const stateSeen = new Set();
  const countries = [];
  const countrySeen = new Set();

  for (const state of rawStates) {
    const normalized = normalizeState(state);
    if (normalized) uniqPush(states, stateSeen, normalized);
  }

  for (const country of rawCountries) {
    const normalized = normalizeCountry(country);
    if (normalized) uniqPush(countries, countrySeen, normalized);
  }

  for (const addr of addresses) {
    for (const [code, variants] of Object.entries(AU_STATE_MAP)) {
      for (const variant of variants) {
        const rx = new RegExp(`\\b${variant.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (rx.test(addr)) {
          uniqPush(states, stateSeen, code);
          break;
        }
      }
    }
  }

  for (const text of texts) {
    for (const [code, variants] of Object.entries(AU_STATE_MAP)) {
      for (const variant of variants) {
        const rx = new RegExp(`\\b${variant.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (rx.test(text)) {
          uniqPush(states, stateSeen, code);
          break;
        }
      }
    }
    for (const [code, variants] of Object.entries(COUNTRY_MAP)) {
      for (const variant of variants) {
        const rx = new RegExp(`\\b${variant.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (rx.test(text)) {
          uniqPush(countries, countrySeen, code);
          break;
        }
      }
    }
  }

  return [...states, ...countries];
}

function extractSignals(raw = {}) {
  const anchors = asArray(raw.anchors);
  const headings = collectHeadings(raw);
  const textBlocks = collectTextBlocks(raw);
  const lists = collectLists(raw);
  const meta = raw.meta || {};
  const jsonld = parseJsonLd(raw);

  const textSources = [
    ...headings,
    ...textBlocks,
    ...lists,
    ...anchors.map((a) => norm(a?.text)),
    ...anchors.map((a) => norm(a?.href)),
    ...Object.values(meta).map((v) => norm(v))
  ].filter(Boolean);

  const emails = extractEmails({ anchors, texts: textSources });
  const phones = extractPhones({ anchors, texts: textSources });
  const urls = extractUrls({ anchors, meta, jsonld, rawUrl: raw.url });
  const addressResult = extractAddresses({ jsonld, rawAddress: raw.identity_address, texts: textSources });
  const geoSignals = extractGeoSignals({
    addresses: addressResult.addresses,
    rawStates: addressResult.states,
    rawCountries: addressResult.countries,
    texts: textSources
  });

  return {
    emails,
    phones,
    urls,
    headings,
    text_blocks: textBlocks,
    addresses: addressResult.addresses,
    geo_signals: geoSignals,
    lists,
    jsonld
  };
}

function tokenize(text) {
  const clean = norm(text).toLowerCase();
  if (!clean) return [];
  return clean
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));
}

function buildServiceSignals(signals) {
  const entries = [];
  for (const heading of signals.headings || []) {
    entries.push({ text: heading, source: 'heading' });
  }
  for (const item of signals.lists || []) {
    entries.push({ text: item, source: 'list' });
  }
  for (const block of signals.text_blocks || []) {
    if (block.split(/\s+/).filter(Boolean).length <= 6) {
      entries.push({ text: block, source: 'text_block' });
    }
  }
  return entries.filter((entry) => entry.text);
}

function groupServiceEvidence(signals) {
  const candidates = buildServiceSignals(signals);
  const clusters = [];

  for (const candidate of candidates) {
    const tokens = tokenize(candidate.text);
    if (!tokens.length) continue;
    let matched = false;

    for (const cluster of clusters) {
      const overlap = tokens.filter((token) => cluster.tokens.has(token));
      if (overlap.length) {
        cluster.signals.push(candidate);
        tokens.forEach((token) => cluster.tokens.add(token));
        cluster.sources.add(candidate.source);
        matched = true;
        break;
      }
    }

    if (!matched) {
      clusters.push({
        signals: [candidate],
        tokens: new Set(tokens),
        sources: new Set([candidate.source])
      });
    }
  }

  return clusters.map((cluster) => ({
    signals: cluster.signals,
    sources: Array.from(cluster.sources),
    support_count: cluster.signals.length,
    source_count: cluster.sources.size
  }));
}

function selectPrimary(list = []) {
  return list.length ? list[0] : null;
}

function resolveIdentityBusinessName(signals) {
  for (const obj of signals.jsonld || []) {
    const name = norm(obj?.name);
    if (name) return name;
  }
  return null;
}

function resolveIdentityAddress(signals) {
  return selectPrimary(signals.addresses);
}

function resolveIdentityState(signals) {
  const state = (signals.geo_signals || []).find((signal) => Object.keys(AU_STATE_MAP).includes(signal));
  return state || null;
}

function resolveIdentityWebsite(signals) {
  return selectPrimary(signals.urls);
}

function resolveIdentityServices(serviceClusters) {
  const services = [];
  for (const cluster of serviceClusters) {
    if (cluster.source_count < 2) continue;
    const label = cluster.signals[0]?.text;
    if (label) services.push(label);
  }
  return services.length ? services.join(', ') : null;
}

function resolveBusinessDescription(signals, serviceClusters) {
  let descriptionSource = '';
  for (const obj of signals.jsonld || []) {
    if (typeof obj?.description === 'string' && obj.description.trim()) {
      descriptionSource = obj.description.trim();
      break;
    }
  }
  if (!descriptionSource) {
    descriptionSource = (signals.text_blocks || []).find((block) => block.split(/\s+/).length >= 15) || '';
  }

  const eligibleServices = serviceClusters.filter((cluster) => cluster.source_count >= 2);
  const serviceNames = eligibleServices.map((cluster) => cluster.signals[0]?.text).filter(Boolean);

  const supportCount = (descriptionSource ? 1 : 0) + eligibleServices.reduce((sum, cluster) => sum + cluster.signals.length, 0);
  if (supportCount < 3 || !descriptionSource || !serviceNames.length) return null;

  const serviceSentence = `Services include ${serviceNames.slice(0, 3).join(', ')}.`;
  const trimmed = descriptionSource.replace(/\s+/g, ' ').trim();
  const descriptionSentence = trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
  return `${descriptionSentence} ${serviceSentence}`.trim();
}

function resolveServiceAreas(signals) {
  const states = (signals.geo_signals || []).filter((signal) => Object.keys(AU_STATE_MAP).includes(signal));
  if (!states.length) return null;
  return Array.from(new Set(states)).join(',');
}

function resolveField(key, signals, rule = {}, clusters = {}) {
  if (key === 'identity_abn') return null;

  switch (key) {
    case 'identity_email':
      return selectPrimary(signals.emails);
    case 'identity_phone':
      return selectPrimary(signals.phones);
    case 'identity_business_name':
      return resolveIdentityBusinessName(signals);
    case 'identity_address':
      return resolveIdentityAddress(signals);
    case 'identity_state':
      return resolveIdentityState(signals);
    case 'identity_website':
    case 'identity_website_url':
      return resolveIdentityWebsite(signals);
    case 'identity_services':
      return resolveIdentityServices(clusters.services || []);
    case 'business_description':
      return resolveBusinessDescription(signals, clusters.services || []);
    case 'service_areas_csv':
      return resolveServiceAreas(signals);
    default:
      return null;
  }
}

function resolveFields(signals, map = {}, allowSet = new Set(), clusters = {}) {
  const fields = {};
  for (const key of allowSet) fields[key] = null;
  for (const [key, rule] of Object.entries(map)) {
    if (!allowSet.has(key)) continue;
    fields[key] = resolveField(key, signals, rule, clusters);
  }
  return fields;
}

function resolveFromRaw(raw = {}, { allowSet = new Set(), map = {} } = {}) {
  const signals = extractSignals(raw);
  const clusters = {
    services: groupServiceEvidence(signals)
  };
  const fields = resolveFields(signals, map, allowSet, clusters);
  return { fields, signals, clusters };
}

module.exports = {
  extractSignals,
  resolveFields,
  resolveFromRaw
};
