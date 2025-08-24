// lib/mvf_resolver.js
// Deterministic minimum viable fill resolver.
// Maps raw crawl data to allowed ACF fields without using an LLM.

function resolveMVF({ raw = {}, tradecard = {}, allowKeys = new Set() } = {}) {
  const fields = {};

  function put(key, value) {
    if (!allowKeys.has(key)) return;
    const s = (value == null ? '' : String(value)).trim();
    if (!s) return;
    fields[key] = s;
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
  const emailSet = new Set();
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  for (const a of anchors) {
    if (a.href.startsWith('mailto:')) {
      emailSet.add(a.href.slice(7).toLowerCase().trim());
    }
    const combined = `${a.href || ''} ${a.text || ''}`;
    let m;
    while ((m = emailRe.exec(combined))) {
      emailSet.add(m[0].toLowerCase().trim());
    }
  }
  const emails = Array.from(emailSet);
  if (emails.length) put('identity_email', emails[0]);

  // phone
  const phoneRaw = new Set();
  const phoneRe = /\+?\d[\d\s()-]{7,}/g;
  for (const a of anchors) {
    if (a.href.startsWith('tel:')) phoneRaw.add(a.href.slice(4));
    let m;
    while ((m = phoneRe.exec(a.text || ''))) {
      phoneRaw.add(m[0]);
    }
  }

  function normalizePhone(num) {
    let s = String(num || '').trim();
    if (!s) return '';
    s = s.replace(/[\s()-]/g, '');
    if (s.startsWith('+610')) s = '+61' + s.slice(4);
    if (s.startsWith('0') && !s.startsWith('+61')) {
      s = '+61' + s.slice(1);
    } else if (!s.startsWith('+')) {
      s = '+' + s;
    }
    s = s.replace(/[^+\d]/g, '');
    const digits = s.replace(/\D/g, '');
    if (digits.length < 10) return '';
    return s;
  }

  const phones = Array.from(phoneRaw)
    .map(normalizePhone)
    .filter(Boolean);
  phones.sort((a, b) => b.length - a.length);
  if (phones.length) put('identity_phone', phones[0]);

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
    const logoRe = /(logo|logomark|brand|icon|favicon)/i;
    const img = images.find((i) => {
      const alt = i.alt || '';
      const src = i.src || '';
      const file = src.split(/[?#]/)[0].split('/').pop() || '';
      return logoRe.test(alt) || logoRe.test(file);
    });
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
  const seenHeadings = new Set();
  for (let i = 0; i < headings.length; i++) {
    const t = (headings[i].text || '').trim();
    if (!t || seenHeadings.has(t)) continue;
    seenHeadings.add(t);
    if (t.length >= 2 && t.length <= 60 && serviceRe.test(t)) {
      put('service_1_title', t);
      serviceIdx = i;
      break;
    }
  }

  // service_1_description
  if (serviceIdx >= 0) {
    const parts = [];
    for (const offset of [-2, -1, 1, 2]) {
      const t = (headings[serviceIdx + offset]?.text || '').trim();
      if (t) parts.push(t);
    }
    const desc = parts.join('. ').slice(0, 200).trim();
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

  // extended identity fields
  if (tradecard?.business?.owner) put('identity_owner', tradecard.business.owner);
  if (tradecard?.business?.role_title)
    put('identity_role_title', tradecard.business.role_title);
  if (tradecard?.business?.headshot)
    put('identity_headshot_url', tradecard.business.headshot);
  if (tradecard?.business?.address) put('identity_address', tradecard.business.address);
  if (tradecard?.business?.abn) put('identity_abn', tradecard.business.abn);

  // theme fields
  if (tradecard?.brand?.tone) put('theme_tone', tradecard.brand.tone);
  if (Array.isArray(tradecard?.brand?.colors))
    put('theme_colors', tradecard.brand.colors.join(','));
  if (tradecard?.theme?.primary_color)
    put('theme_primary_color', tradecard.theme.primary_color);
  if (tradecard?.theme?.accent_color)
    put('theme_accent_color', tradecard.theme.accent_color);

  // testimonials
  if (Array.isArray(tradecard?.testimonials)) {
    for (let i = 0; i < Math.min(3, tradecard.testimonials.length); i++) {
      const t = tradecard.testimonials[i];
      if (typeof t === 'string') {
        put(`testimonial_${i + 1}_quote`, t);
      } else if (t && typeof t === 'object') {
        put(`testimonial_${i + 1}_quote`, t.quote);
        put(`testimonial_${i + 1}_reviewer`, t.reviewer);
        put(`testimonial_${i + 1}_location`, t.location);
        put(`testimonial_${i + 1}_source`, t.source);
      }
    }
  }

  // trust fields
  if (Array.isArray(tradecard?.trust)) {
    for (let i = 0; i < Math.min(5, tradecard.trust.length); i++) {
      put(`trust_${i + 1}`, tradecard.trust[i]);
    }
  } else if (tradecard?.trust && typeof tradecard.trust === 'object') {
    for (const [k, v] of Object.entries(tradecard.trust)) {
      put(`trust_${k}`, v);
    }
  }

  return { fields, audit: Object.keys(fields).map((k) => ({ key: k, source: 'mvf' })) };
}

module.exports = { resolveMVF };
