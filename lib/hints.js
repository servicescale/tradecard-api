// lib/hints.js
// Extract best-effort hints from raw crawl data.

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s()-]{7,}/g;
const SERVICE_RE = /(service|repair|install|inspection|quote|booking|clean|maintenance|pool|aircon|fence|paint|build)/i;

function normPhone(p) {
  let s = String(p || '').replace(/[\s()-]/g, '').trim();
  if (!s) return '';
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '');
  if (s.startsWith('0')) return '+61' + s.slice(1).replace(/\D/g, '');
  return '+' + s.replace(/\D/g, '');
}

function extractHints(raw = {}) {
  const anchors = Array.isArray(raw.anchors) ? raw.anchors : [];
  const headings = Array.isArray(raw.headings) ? raw.headings : [];
  const images = Array.isArray(raw.images) ? raw.images : [];
  const emails = [];
  const phones = [];
  const socials = {};

  for (const a of anchors) {
    const href = (a && a.href) || '';
    const text = (a && a.text) || '';
    const lowHref = href.toLowerCase();

    if (lowHref.startsWith('mailto:')) emails.push(href.slice(7));
    if (lowHref.startsWith('tel:')) phones.push(href.slice(4));

    const combined = `${href} ${text}`;
    EMAIL_RE.lastIndex = 0;
    PHONE_RE.lastIndex = 0;
    let m;
    while ((m = EMAIL_RE.exec(combined))) emails.push(m[0]);
    while ((m = PHONE_RE.exec(combined))) phones.push(m[0]);

    let host = '';
    try {
      host = new URL(href).hostname.toLowerCase();
    } catch {}
    if (host.includes('facebook.com')) socials.facebook = href;
    else if (host.includes('instagram.com')) socials.instagram = href;
    else if (host.includes('linkedin.com')) socials.linkedin = href;
    else if (host.includes('x.com') || host.includes('twitter.com')) socials.twitter = href;
    else if (host.includes('youtube.com') || host.includes('youtu.be')) socials.youtube = href;
    else if (host.includes('tiktok.com')) socials.tiktok = href;
    else if (host.includes('pinterest.')) socials.pinterest = href;
  }

  const emailsOut = uniq(emails.map((e) => String(e).toLowerCase().trim()));
  const phonesOut = uniq(phones.map(normPhone).filter(Boolean));

  const meta = raw.meta || {};
  let logo_url = meta['og:image'] || meta.icon;
  if (!logo_url) {
    const img = images.find((im) => /logo|brand/i.test(im.alt || ''));
    if (img) logo_url = img.src;
  }

  let name;
  let website;
  const jsonld = Array.isArray(raw.jsonld) ? raw.jsonld : [];
  for (const node of jsonld) {
    const types = [].concat(node && node['@type'] || []);
    if (types.some((t) => ['Organization', 'WebSite', 'LocalBusiness'].includes(t))) {
      if (!name && typeof node.name === 'string') name = node.name;
      if (!website && typeof node.url === 'string') website = node.url;
      if (!logo_url && typeof node.logo === 'string') logo_url = node.logo;
    }
  }
  if (!name && typeof meta['og:site_name'] === 'string') name = meta['og:site_name'];
  if (!website && typeof meta.canonical === 'string') website = meta.canonical;

  const service_titles = [];
  for (const h of headings) {
    const t = ((h && h.text) || h || '').trim();
    if (t.length >= 2 && t.length <= 60 && SERVICE_RE.test(t)) {
      if (!service_titles.includes(t)) service_titles.push(t);
      if (service_titles.length >= 3) break;
    }
  }

  for (const k of Object.keys(socials)) {
    const v = String(socials[k] || '').trim();
    if (v) socials[k] = v; else delete socials[k];
  }

  const out = { emails: emailsOut, phones: phonesOut, socials };
  if (logo_url && logo_url.trim()) out.logo_url = logo_url.trim();
  if (name && name.trim()) out.name = name.trim();
  if (website && website.trim()) out.website = website.trim();
  if (service_titles.length) out.service_titles = service_titles;
  return out;
}

module.exports = { extractHints };
