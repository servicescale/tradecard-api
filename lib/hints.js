// lib/hints.js
// Extract simple deterministic hints from raw crawl data.

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function normEmail(e) {
  return String(e).toLowerCase().trim();
}

function normPhone(p) {
  return String(p).replace(/[^+\d]/g, '').trim();
}

function extractHints(raw = {}) {
  const anchors = Array.isArray(raw.anchors) ? raw.anchors : [];
  const emails = [];
  const phones = [];
  const socials = {};

  for (const a of anchors) {
    const href = typeof a === 'string' ? a : a?.href;
    if (!href || typeof href !== 'string') continue;
    const low = href.toLowerCase();
    if (low.startsWith('mailto:')) emails.push(href.slice(7));
    if (low.startsWith('tel:')) phones.push(href.slice(4));

    if (low.includes('facebook.com')) socials.facebook = href;
    else if (low.includes('instagram.com')) socials.instagram = href;
    else if (low.includes('linkedin.com')) socials.linkedin = href;
    else if (low.includes('twitter.com') || low.includes('x.com')) socials.twitter = href;
    else if (low.includes('youtube.com') || low.includes('youtu.be')) socials.youtube = href;
    else if (low.includes('tiktok.com')) socials.tiktok = href;
    else if (low.includes('pinterest.')) socials.pinterest = href;
  }

  const emailsOut = uniq(emails.map(normEmail));
  const phonesOut = uniq(phones.map(normPhone));

  let logo_url;
  let name;
  let website;
  const meta = raw.meta || {};
  if (typeof meta.icon === 'string') logo_url = meta.icon;
  if (typeof meta['og:image'] === 'string' && !logo_url) logo_url = meta['og:image'];
  if (typeof meta['og:site_name'] === 'string') name = meta['og:site_name'];
  if (!name && typeof meta.title === 'string') name = meta.title;
  if (typeof meta.canonical === 'string') website = meta.canonical;
  if (!website && typeof meta['og:url'] === 'string') website = meta['og:url'];

  if (!name && Array.isArray(raw.headings)) {
    const h = raw.headings.find((t) => typeof t === 'string' && t.trim());
    if (h) name = h.trim();
  }
  if (!website && Array.isArray(raw.paragraphs)) {
    const p = raw.paragraphs.find((t) => typeof t === 'string' && /^https?:\/\//i.test(t.trim()));
    if (p) website = p.trim();
  }

  const jsonld = raw.jsonld;
  const nodes = Array.isArray(jsonld) ? jsonld : jsonld ? [jsonld] : [];
  for (const node of nodes) {
    const type = node && node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => ['Organization', 'LocalBusiness', 'WebSite'].includes(t))) {
      if (!name && typeof node.name === 'string') name = node.name;
      if (!website && typeof node.url === 'string') website = node.url;
      if (!logo_url && typeof node.logo === 'string') logo_url = node.logo;
    }
  }

  if (!logo_url && Array.isArray(raw.images)) {
    const img = raw.images.find((im) => {
      const src = im?.src || im;
      const alt = im?.alt || '';
      return /logo/i.test(src) || /logo/i.test(alt);
    });
    if (img) logo_url = img.src || img;
  }

  const out = { emails: emailsOut, phones: phonesOut, socials };
  if (logo_url && logo_url.trim()) out.logo_url = logo_url.trim();
  if (name && name.trim()) out.name = name.trim();
  if (website && website.trim()) out.website = website.trim();
  return out;
}

module.exports = { extractHints };

