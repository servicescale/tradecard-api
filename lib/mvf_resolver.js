// lib/mvf_resolver.js
// Deterministic minimum viable fill resolver.
// Maps raw crawl data to allowed ACF fields without using an LLM.

function resolveMVF({ raw = {}, tradecard = {}, allowKeys = new Set() } = {}) {
  const fields = {};
  const audit = [];

  function put(key, value) {
    if (!allowKeys.has(key)) return;
    const s = (value == null ? '' : String(value)).trim();
    if (!s) return;
    fields[key] = s;
    audit.push({ key, source: 'mvf' });
  }

  const anchors = Array.isArray(raw.anchors)
    ? raw.anchors.map((a) => ({
        href: a?.href || '',
        text: a?.text || ''
      }))
    : [];

  const headings = Array.isArray(raw.headings)
    ? raw.headings.map((h) => (typeof h === 'string' ? { text: h } : { text: h?.text || '' }))
    : [];

  const images = Array.isArray(raw.images)
    ? raw.images.map((img) => ({
        src: img?.src || img,
        alt: img?.alt || ''
      }))
    : [];

  const meta = raw.meta || {};
  const jsonld = Array.isArray(raw.jsonld) ? raw.jsonld : [];

  // email
  for (const a of anchors) {
    const href = a.href || '';
    const text = a.text || '';
    if (href.startsWith('mailto:') || text.includes('@')) {
      const candidate = href.startsWith('mailto:') ? href.slice(7) : text;
      const match = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (match) {
        put('identity_email', match[0].toLowerCase());
        break;
      }
    }
  }

  // phone
  for (const a of anchors) {
    const href = a.href || '';
    const text = a.text || '';
    if (href.startsWith('tel:') || /\d/.test(text)) {
      const candidate = href.startsWith('tel:') ? href.slice(4) : text;
      const match = candidate.match(/\+?\d[\d\s()-]{7,}/);
      if (match) {
        let num = match[0].replace(/[^\d+]/g, '');
        if (num.startsWith('0')) {
          num = '+61' + num.slice(1);
        } else if (!num.startsWith('+')) {
          num = '+' + num;
        }
        put('identity_phone', num);
        break;
      }
    }
  }

  // socials
  const socialHosts = {
    facebook: 'facebook',
    instagram: 'instagram',
    linkedin: 'linkedin',
    'x.com': 'twitter',
    twitter: 'twitter',
    youtube: 'youtube',
    'youtu.be': 'youtube',
    tiktok: 'tiktok',
    pinterest: 'pinterest'
  };
  const seenSocial = new Set();
  for (const a of anchors) {
    try {
      const url = new URL(a.href);
      const host = url.hostname.toLowerCase();
      for (const key of Object.keys(socialHosts)) {
        if (host.includes(key)) {
          const plat = socialHosts[key];
          if (!seenSocial.has(plat)) {
            put(`social_links_${plat}`, url.href);
            seenSocial.add(plat);
          }
          break;
        }
      }
    } catch {
      // ignore invalid URLs
    }
  }

  // logo_url
  if (typeof meta['og:image'] === 'string') {
    put('identity_logo_url', meta['og:image']);
  } else {
    const img = images.find((i) => /logo|brand/i.test(i.alt || ''));
    if (img && img.src) put('identity_logo_url', img.src);
  }

  // name
  let name;
  for (const obj of jsonld) {
    const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
    if (
      types.some((t) =>
        String(t).toLowerCase().match(/^(organization|website|localbusiness)$/)
      ) &&
      obj.name
    ) {
      name = obj.name;
      break;
    }
  }
  if (!name && typeof meta['og:site_name'] === 'string') {
    name = meta['og:site_name'];
  }
  if (!name && tradecard?.business?.name) {
    name = tradecard.business.name;
  }
  if (name) put('identity_business_name', name);

  // website
  let website;
  for (const obj of jsonld) {
    if (obj.url) {
      website = obj.url;
      break;
    }
  }
  if (!website && typeof meta.canonical === 'string') {
    website = meta.canonical;
  }
  if (!website && typeof meta['og:url'] === 'string') {
    website = meta['og:url'];
  }
  if (!website && tradecard?.contacts?.website) {
    website = tradecard.contacts.website;
  }
  if (website) put('identity_website_url', website);

  // service_1_title
  const serviceRe =
    /(service|repair|install|inspection|quote|booking|clean|maintenance|pool|aircon|fence|paint|build)/i;
  let serviceIdx = -1;
  for (let i = 0; i < headings.length; i++) {
    const t = (headings[i].text || '').trim();
    if (t.length >= 2 && t.length <= 60 && serviceRe.test(t)) {
      put('service_1_title', t);
      serviceIdx = i;
      break;
    }
  }

  // service_1_description
  if (serviceIdx >= 0) {
    const parts = [];
    if (headings[serviceIdx + 1]?.text)
      parts.push(headings[serviceIdx + 1].text);
    if (headings[serviceIdx + 2]?.text)
      parts.push(headings[serviceIdx + 2].text);
    for (const a of anchors) {
      if (parts.length >= 2) break;
      const t = (a.text || '').trim();
      if (t) parts.push(t);
    }
    const desc = parts.join(' ').slice(0, 200).trim();
    if (desc) put('service_1_description', desc);
  }

  // business_description
  const ignoreHeadings = /^(home|contact|about|services?|menu|navigation|search)$/i;
  const bdParts = [];
  for (const h of headings) {
    const t = (h.text || '').trim();
    if (!t || ignoreHeadings.test(t)) continue;
    bdParts.push(t);
    if (bdParts.length >= 2) break;
  }
  if (bdParts.length) {
    const bd = bdParts.join('. ').slice(0, 240).trim();
    if (bd) put('business_description', bd);
  }

  // service_areas_csv
  const areaCandidates = new Set();
  const areaRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  function collectAreas(text) {
    if (!text) return;
    let m;
    while ((m = areaRe.exec(text))) {
      const token = m[1];
      if (
        !ignoreHeadings.test(token) &&
        !serviceRe.test(token.toLowerCase())
      ) {
        areaCandidates.add(token);
      }
    }
  }
  headings.forEach((h) => collectAreas(h.text));
  anchors.forEach((a) => collectAreas(a.text));
  if (areaCandidates.size) {
    put('service_areas_csv', Array.from(areaCandidates).join(','));
  }

  return { fields, audit };
}

module.exports = { resolveMVF };
