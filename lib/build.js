// lib/build.js
// Crawl a site and build a TradeCard structure from pages.

const { scrapePage } = require('./scrape');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const isHttp = (u) => { try { return ALLOWED_PROTOCOLS.has(new URL(u).protocol); } catch { return false; } };
const pickDomain = (url) => { try { return new URL(url).hostname.replace(/^www\./,''); } catch { return null; } };
const uniq = (arr, keyer) => keyer
  ? Array.from(new Map(arr.filter(Boolean).map(v => [keyer(v), v])).values())
  : Array.from(new Set(arr.filter(Boolean)));

function detectLogo(images) {
  const ranked = images
    .map(u => ({ u, n: (u.split('/').pop() || '').toLowerCase() }))
    .sort((a, b) => {
      const score = (x) =>
        (x.n.includes('logo') ? 100 : 0) +
        (x.n.includes('icon') ? 25 : 0) +
        (x.n.endsWith('.svg') ? 15 : 0) +
        (x.n.endsWith('.png') ? 10 : 0) -
        (x.n.includes('hero') ? 20 : 0) -
        (x.n.includes('background') ? 10 : 0);
      return score(b) - score(a);
    });
  return ranked.length ? ranked[0].u : null;
}
function pickHero(images) {
  const ranked = images
    .map(u => ({ u, l: u.toLowerCase() }))
    .sort((a, b) => {
      const score = (x) =>
        (x.l.includes('hero') ? 100 : 0) +
        (x.l.includes('banner') ? 80 : 0) +
        (/\b(2000|2400|2500|3000|3840)\b/.test(x.l) ? 50 : 0) +
        (/\b(1500|1600|1800)\b/.test(x.l) ? 30 : 0);
      return score(b) - score(a);
    });
  return ranked.length ? ranked[0].u : null;
}

async function crawlSite(startUrl, { maxPages = 12, maxDepth = 2, sameOriginOnly = true } = {}) {
  const origin = new URL(startUrl).origin;
  const visited = new Set();
  const queue = [[startUrl, 0]];
  const pages = [];

  while (queue.length && pages.length < maxPages) {
    const [url, depth] = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const { page } = await scrapePage(url);
      pages.push(page);
      if (depth < maxDepth) {
        const next = (page.links || []).filter((href) => {
          if (!href) return false;
          if (sameOriginOnly && !href.startsWith(origin)) return false;
          if (href.includes('#')) return false;
          return true;
        });
        for (const href of next) {
          if (pages.length + queue.length >= maxPages) break;
          if (!visited.has(href)) queue.push([href, depth + 1]);
        }
      }
    } catch { /* continue */ }
  }
  return pages;
}

function buildTradecardFromPages(startUrl, pages) {
  const domain = pickDomain(startUrl);

  const allLinks  = uniq(pages.flatMap(p => p.links  || []));
  const allImages = uniq(pages.flatMap(p => p.images || [])).filter(isHttp);

  const pageSocials = pages.flatMap(p => p.social || []);
  const pageEmails  = pages.flatMap(p => (p.contacts?.emails || []));
  const pagePhones  = pages.flatMap(p => (p.contacts?.phones || []));

  const social = uniq(pageSocials, s => `${s.platform}:${s.url}`);
  const emails = uniq(pageEmails);
  const phones = uniq(pagePhones);

  const home = pages.find(p => pickDomain(p.url) === domain);
  const businessName = (home?.title || '')
    .replace(/\s*\|\s*.*/, '')
    .replace(/\s*-\s*.*/, '')
    .trim() || domain;

  const logo = detectLogo(allImages);
  const hero = pickHero(allImages);

  const headings = pages.flatMap(p => {
    const tags = [];
    for (const level of ['h1','h2','h3','h4','h5','h6']) {
      (p.headings?.[level] || []).forEach(text => tags.push({ level, text, url: p.url }));
    }
    return tags;
  });

  const needs_inference = [
    'business.description',
    'services.list',
    'service_areas',
    'brand.tone',
    'testimonials'
  ];

  return {
    site: {
      url: startUrl,
      domain,
      crawled_at: new Date().toISOString(),
      pages_count: pages.length
    },
    tradecard: {
      business: {
        name: businessName,
        owner: null,
        role_title: null,
        headshot: null,
        address: null,
        abn: null,
        description: null
      },
      contacts: { emails, phones, website: startUrl },
      social,
      assets: { logo, hero, images: allImages.slice(0, 200) },
      content: { headings },
      services: { list: null },
      service_areas: null,
      brand: { tone: null, colors: null },
      theme: { primary_color: null, accent_color: null },
      testimonials: [{ quote: null, reviewer: null, location: null, source: null }],
      trust: {
        qr_text: null,
        google_rating: null,
        awards: null,
        contact_form_url: null,
        vcf_link: null
      }
    },
    provenance: {
      start_url: startUrl,
      pages: pages.map(p => ({ url: p.url, title: p.title, images: (p.images || []).length })),
      extraction: {
        social_from_links: true,
        contacts_from_mailto_tel: true,
        logo_heuristic: 'filename:logo/icon/mark preference',
        hero_heuristic: 'filename hero/banner or large cdn hints'
      }
    },
    needs_inference
  };
}

module.exports = { crawlSite, buildTradecardFromPages };
