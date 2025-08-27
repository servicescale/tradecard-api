// lib/mvf_resolver.js
// Deterministic minimum viable fill resolver.
// Maps raw crawl data to allowed ACF fields without using an LLM.

const { gmbLookup } = require('./gmb_lookup');

async function resolveMVF({ raw = {}, tradecard = {}, allowKeys = new Set() } = {}) {
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
  const texts = Array.isArray(raw.text_blocks)
    ? raw.text_blocks.map((t) => String(t))
    : [];
  const profileVideos = Array.isArray(raw.profile_videos) ? raw.profile_videos : [];
  const contactForms = Array.isArray(raw.contact_form_links) ? raw.contact_form_links : [];
  const awards = Array.isArray(raw.awards) ? raw.awards : [];

  const { resolveTestimonial } = require('./resolve');
  const resolvedTesti = resolveTestimonial(
    raw.testimonials,
    raw.gmb_lookup && raw.gmb_lookup.testimonials
  );
  if (resolvedTesti.quote) put('testimonial_quote', resolvedTesti.quote);
  if (resolvedTesti.reviewer) put('testimonial_reviewer', resolvedTesti.reviewer);
  if (resolvedTesti.location) put('testimonial_location', resolvedTesti.location);
  if (resolvedTesti.source_label) put('testimonial_source_label', resolvedTesti.source_label);
  if (resolvedTesti.source_url) put('testimonial_source_url', resolvedTesti.source_url);
  if (resolvedTesti.job_type) put('testimonial_job_type', resolvedTesti.job_type);

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

  // contact URIs
  let uriPhone, uriEmail, uriSms, uriWhatsapp;
  for (const a of anchors) {
    const href = (a.href || '').toLowerCase();
    if (!uriEmail && href.startsWith('mailto:')) {
      const addr = href.replace(/^mailto:/, '').split('?')[0];
      if (addr) uriEmail = `mailto:${addr}`;
    }
    if (!uriPhone && href.startsWith('tel:')) {
      const num = normalizePhone(href.slice(4));
      if (num) uriPhone = `tel:${num}`;
    }
    if (!uriSms && href.startsWith('sms:')) {
      const num = normalizePhone(href.slice(4));
      if (num) uriSms = `sms:${num}`;
    }
    if (!uriWhatsapp && (href.includes('wa.me') || href.includes('whatsapp')))
      uriWhatsapp = a.href;
  }
  if (uriPhone) put('identity_uri_phone', uriPhone);
  if (uriEmail) put('identity_uri_email', uriEmail);
  if (uriSms) put('identity_uri_sms', uriSms);
  if (uriWhatsapp) put('identity_uri_whatsapp', uriWhatsapp);

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

  // owner / role / headshot from jsonld and text
  let ownerName, roleTitle, headshot;
  for (const obj of jsonld) {
    if (obj && typeof obj === 'object') {
      if (!ownerName && obj.founder && obj.founder.name) {
        ownerName = obj.founder.name;
        if (obj.founder.jobTitle) roleTitle = obj.founder.jobTitle;
      }
      if (!ownerName && obj.owner && obj.owner.name) {
        ownerName = obj.owner.name;
        if (obj.owner.jobTitle) roleTitle = obj.owner.jobTitle;
      }
      const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
      if (types.some((t) => String(t).toLowerCase() === 'person') && obj.name) {
        ownerName = ownerName || obj.name;
        roleTitle = roleTitle || obj.jobTitle;
        if (typeof obj.image === 'string') headshot = obj.image;
      }
    }
  }
  if (!ownerName) {
    for (const t of texts) {
      const m = /(owner|director|founder|manager)[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i.exec(t);
      if (m) {
        roleTitle = roleTitle || m[1];
        ownerName = m[2];
        break;
      }
    }
  }
  if (!headshot) {
    const headRe = /(headshot|portrait|profile|owner)/i;
    const img = images.find((i) => {
      const alt = i.alt || '';
      const src = i.src || '';
      const file = src.split(/[?#]/)[0].split('/').pop() || '';
      return headRe.test(alt) || headRe.test(file);
    });
    if (img && img.src) headshot = img.src;
  }
  if (ownerName) put('identity_owner_name', ownerName);
  if (roleTitle) put('identity_role_title', roleTitle);
  if (headshot) put('identity_headshot_url', headshot);

  // suburb/state/address/business type
  let suburb, state, address, businessType;
  for (const obj of jsonld) {
    if (obj && typeof obj === 'object') {
      const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
      const t = types.find((v) => v && !String(v).toLowerCase().match(/^(organization|website|person)$/));
      if (t && !businessType) businessType = t;
      if (obj.address && typeof obj.address === 'object') {
        if (!suburb && obj.address.addressLocality) suburb = obj.address.addressLocality;
        if (!state && obj.address.addressRegion) state = obj.address.addressRegion;
        if (!address) {
          const parts = [
            obj.address.streetAddress,
            obj.address.addressLocality,
            obj.address.addressRegion,
            obj.address.postalCode
          ].filter(Boolean);
          if (parts.length) address = parts.join(', ');
        }
      }
    }
  }
  if (!suburb || !state) {
    for (const t of texts) {
      const m = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,?\s*(NSW|QLD|VIC|WA|SA|TAS|ACT|NT)\b/.exec(t);
      if (m) {
        if (!suburb) suburb = m[1];
        if (!state) state = m[2];
        break;
      }
    }
  }
  if (suburb) put('identity_suburb', suburb);
  if (state) put('identity_state', state);
  if (address) put('identity_address', address);
  if (businessType) put('identity_business_type', businessType);

  // address uri
  for (const a of anchors) {
    const h = (a.href || '').toLowerCase();
    if (/(google\.com\/maps|goo\.gl\/maps|maps\.app\.goo\.gl)/.test(h)) {
      put('identity_address_uri', a.href);
      break;
    }
  }

  // suburb/state via meta
  if (!suburb && typeof meta['place:locality'] === 'string') put('identity_suburb', meta['place:locality']);
  if (!state && typeof meta['place:region'] === 'string') put('identity_state', meta['place:region']);

  // ABN
  for (const t of texts) {
    const m = /ABN\s*[:#-]?\s*([0-9 ]{9,11})/i.exec(t);
    if (m) {
      put('identity_abn', m[1].replace(/\s+/g, ''));
      break;
    }
  }

  // insured
  for (const t of texts) {
    if (/\binsured\b/i.test(t)) {
      put('identity_insured', 'yes');
      break;
    }
  }

  // services
  const serviceRe =
    /(service|repair|install|inspection|quote|booking|clean|maintenance|pool|aircon|fence|paint|build)/i;
  const seenHeadings = new Set();
  const services = [];
  for (let i = 0; i < headings.length && services.length < 3; i++) {
    const t = (headings[i].text || '').trim();
    if (!t || seenHeadings.has(t)) continue;
    seenHeadings.add(t);
    if (t.length >= 2 && t.length <= 60 && serviceRe.test(t)) {
      services.push({ idx: i, title: t });
    }
  }
  services.forEach((svc, idx) => {
    const num = idx + 1;
    put(`service_${num}_title`, svc.title);
    const m = svc.title.match(/[:\-]\s*(.+)$/);
    if (m) put(`service_${num}_subtitle`, m[1]);
    const parts = [];
    for (const offset of [-2, -1, 1, 2]) {
      const t = (headings[svc.idx + offset]?.text || '').trim();
      if (t) parts.push(t);
    }
    const desc = parts.join('. ').slice(0, 200).trim();
    if (desc) put(`service_${num}_description`, desc);
    const j = texts.findIndex((tx) => tx === svc.title);
    const near = j >= 0 ? texts.slice(j + 1, j + 8) : [];
    const priceBlock = near.find((t) => /\$\s?\d/.test(t));
    if (priceBlock) {
      const pm = priceBlock.match(/\$\s?\d[\d.,]*/);
      if (pm) put(`service_${num}_price`, pm[0]);
      put(`service_${num}_price_note`, priceBlock);
    }
    const modes = new Set();
    for (const t of near) {
      if (/online/i.test(t)) modes.add('online');
      if (/on\s?-?site|in[- ]?person/i.test(t)) modes.add('onsite');
      if (/remote|virtual/i.test(t)) modes.add('remote');
    }
    if (modes.size) put(`service_${num}_delivery_modes`, Array.from(modes).join(','));
    const incs = near
      .filter((t) => /^[-•]/.test(t) || /includes?:/i.test(t))
      .slice(0, 3);
    incs.forEach((t, k) =>
      put(`service_${num}_inclusion_${k + 1}`, t.replace(/^[-•]\s*/, ''))
    );
    const tags = new Set();
    near.forEach((t) => {
      const m2 = t.match(/#(\w+)/g);
      if (m2) m2.forEach((tag) => tags.add(tag.slice(1)));
    });
    if (tags.size) put(`service_${num}_tags`, Array.from(tags).join(','));
    const vid = anchors.find((a) => /(youtube|youtu\.be|vimeo)/i.test(a.href));
    if (vid) put(`service_${num}_video_url`, vid.href);
    const panel = near.find((t) => /(popular|best|recommended)/i.test(t));
    if (panel) put(`service_${num}_panel_tag`, panel);
  });

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

  // testimonials from jsonld
  if (!fields.testimonial_quote) {
    for (const obj of jsonld) {
      if (obj && typeof obj === 'object') {
        const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
        if (
          types.some((t) => {
            const s = String(t).toLowerCase();
            return s === 'review' || s === 'testimonial';
          })
        ) {
          if (obj.reviewBody || obj.description)
            put('testimonial_quote', obj.reviewBody || obj.description);
          if (obj.author && obj.author.name)
            put('testimonial_reviewer', obj.author.name);
          if (obj.author && obj.author.address && obj.author.address.addressLocality)
            put('testimonial_location', obj.author.address.addressLocality);
          if (obj.publisher && obj.publisher.name)
            put('testimonial_source_label', obj.publisher.name);
          if (obj.publisher && obj.publisher.url)
            put('testimonial_source_url', obj.publisher.url);
          if (obj.itemReviewed && obj.itemReviewed.name)
            put('testimonial_job_type', obj.itemReviewed.name);
          break;
        }
      }
    }
  }

  // theme color
  if (!fields.theme_primary_color) {
    const metaColor = raw.meta_theme_color;
    if (typeof metaColor === 'string' && metaColor.trim()) {
      put('theme_primary_color', metaColor.trim());
    } else if (raw.css_variables && typeof raw.css_variables === 'object') {
      const vars = raw.css_variables;
      const candidates = [
        'primary-color',
        'primary_colour',
        'primary',
        'color-primary',
        'brand-color',
        'brand-colour'
      ];
      for (const name of candidates) {
        const value = vars[name];
        if (typeof value === 'string' && value.trim()) {
          put('theme_primary_color', value.trim());
          break;
        }
      }
    }
  }

  // trust signals
  for (const t of texts) {
    if (!fields.trust_qr_text && /qr\s*code/i.test(t)) put('trust_qr_text', t);
  }
  for (const obj of jsonld) {
    if (obj && obj.aggregateRating) {
      if (obj.aggregateRating.ratingValue)
        put('trust_google_rating', obj.aggregateRating.ratingValue);
      if (obj.aggregateRating.reviewCount)
        put('trust_google_review_count', obj.aggregateRating.reviewCount);
    }
    if (obj && obj.url && /google\./i.test(obj.url) && /review/i.test(obj.url))
      put('trust_google_review_url', obj.url);
  }
  for (const a of anchors) {
    const h = (a.href || '').toLowerCase();
    if (!fields.trust_google_review_url && /(google\.com\/maps)/.test(h))
      put('trust_google_review_url', a.href);
    if (!fields.trust_review_button_link && /review/i.test(a.text || ''))
      put('trust_review_button_link', a.href);
    if (!fields.trust_profile_video_url && /(youtube|youtu\.be|vimeo)/i.test(h))
      put('trust_profile_video_url', a.href);
    if (!fields.trust_award && /award/i.test(a.text || '')) {
      put('trust_award', a.text.trim());
      put('trust_award_link', a.href);
    }
  }

  if (!fields.trust_contact_form && contactForms.length)
    put('trust_contact_form', contactForms[0]);
  if (!fields.trust_profile_video_url && profileVideos.length) {
    const vid = profileVideos.find((v) => /(youtube|youtu\.be|vimeo)/i.test(v));
    if (vid) put('trust_profile_video_url', vid);
  }
  if (!fields.trust_award && awards.length) {
    const a = awards[0];
    if (a.text) put('trust_award', a.text);
    if (a.href && !fields.trust_award_link) put('trust_award_link', a.href);
  }

  if (fields.trust_google_review_url &&
      (!fields.trust_google_rating || !fields.trust_google_review_count)) {
    try {
      const info = await gmbLookup(fields.trust_google_review_url);
      if (info) {
        if (info.rating && !fields.trust_google_rating)
          put('trust_google_rating', info.rating);
        if (info.reviewCount && !fields.trust_google_review_count)
          put('trust_google_review_count', info.reviewCount);
        if (info.url && !fields.trust_google_review_url)
          put('trust_google_review_url', info.url);
      }
    } catch {}
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
