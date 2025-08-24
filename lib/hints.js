// lib/hints.js
// Extract deterministic hints from raw crawl data.

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function cleanPhone(p) {
  if (!p) return null;
  const digits = p.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? '+' + digits.replace(/[^\d]/g, '') : digits;
}

function extractHints(raw = {}) {
  const anchors = Array.isArray(raw.anchors) ? raw.anchors : (Array.isArray(raw.links) ? raw.links.map((h) => ({ href: h })) : []);
  const texts = [];
  if (Array.isArray(raw.headings)) texts.push(...raw.headings);
  if (Array.isArray(raw.paragraphs)) texts.push(...raw.paragraphs);

  const emails = [];
  const phones = [];
  const socials = {};

  for (const a of anchors) {
    const href = (a && a.href) || a;
    if (typeof href !== 'string') continue;
    const low = href.toLowerCase();
    if (low.startsWith('mailto:')) emails.push(href.replace(/^mailto:/i, '').trim());
    if (low.startsWith('tel:')) phones.push(href.replace(/^tel:/i, '').trim());

    if (low.includes('facebook.com')) socials.facebook = href;
    else if (low.includes('instagram.com')) socials.instagram = href;
    else if (low.includes('linkedin.com')) socials.linkedin = href;
    else if (low.includes('twitter.com') || low.includes('x.com')) socials.twitter = href;
    else if (low.includes('youtube.com') || low.includes('youtu.be')) socials.youtube = href;
    else if (low.includes('tiktok.com')) socials.tiktok = href;
    else if (low.includes('pinterest.')) socials.pinterest = href;
  }

  const blob = texts.join(' ');
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const phoneRe = /(?:\+?61|0)[\d\s\-()]{6,16}/g;

  let m;
  while ((m = emailRe.exec(blob)) !== null) emails.push(m[0]);
  while ((m = phoneRe.exec(blob)) !== null) phones.push(m[0]);

  const cleanPhones = uniq(phones.map(cleanPhone)).filter((p) => /^(?:\+?61|0)\d{8,10}$/.test(p));
  const cleanEmails = uniq(emails.map((e) => e.toLowerCase()));

  let logo_url = raw.meta?.icon || raw.meta?.['og:image'];
  if (!logo_url && Array.isArray(raw.images)) {
    const img = raw.images.find((im) => /logo/i.test(im.alt || im.src || im));
    if (img) logo_url = img.src || img;
  }

  const jsonld = raw.jsonld || raw.schema;
  const nodes = Array.isArray(jsonld) ? jsonld : (jsonld ? [jsonld] : []);
  let name;
  let website;
  const service_titles = [];
  const scanNode = (node) => {
    const type = node && node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => ['Organization', 'LocalBusiness', 'WebSite'].includes(t))) {
      if (!name && typeof node.name === 'string') name = node.name;
      if (!website && typeof node.url === 'string') website = node.url;
    }
    if (types.includes('Service') && typeof node.name === 'string') {
      service_titles.push(node.name);
    }
    if (Array.isArray(node['@graph'])) node['@graph'].forEach(scanNode);
    if (Array.isArray(node.hasPart)) node.hasPart.forEach(scanNode);
  };
  nodes.forEach(scanNode);

  if (!name && raw.meta && typeof raw.meta['og:site_name'] === 'string') name = raw.meta['og:site_name'];
  if (!website && raw.meta && typeof raw.meta.canonical === 'string') website = raw.meta.canonical;

  return {
    emails: cleanEmails,
    phones: cleanPhones,
    socials,
    logo_url,
    name,
    website,
    service_titles: uniq(service_titles).slice(0, 3)
  };
}

module.exports = { extractHints };

