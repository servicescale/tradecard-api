// /api/build-card.js
// Build a TradeCard-ready JSON from a site URL using the scraper.
// Deterministic extraction only; inference fields left null with provenance.

const { scrapePage } = require('./scrape');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const isHttp = (u) => { try { return ALLOWED_PROTOCOLS.has(new URL(u).protocol); } catch { return false; } };

function pickDomain(url) { try { return new URL(url).hostname.replace(/^www\./,''); } catch { return null; } }
function uniq(arr, keyer) {
  if (!keyer) return Array.from(new Set(arr.filter(Boolean)));
  return Array.from(new Map(arr.filter(Boolean).map(v => [keyer(v), v])).values());
}

// light heuristics
function detectSocial(href) {
  if (!href) return null;
  const h = href.toLowerCase();
  if (h.includes('facebook.com')) return { platform: 'facebook', url: href };
  if (h.includes('instagram.com')) return { platform: 'instagram', url: href };
  if (h.includes('linkedin.com')) return { platform: 'linkedin', url: href };
  if (h.includes('tiktok.com')) return { platform: 'tiktok', url: href };
  if (h.includes('youtube.com') || h.includes('youtu.be')) return { platform: 'youtube', url: href };
  if (h.includes('x.com') || h.includes('twitter.com')) return { platform: 'twitter', url: href };
  return null;
}

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
    } catch {
      // continue
    }
  }
  return pages;
}

function buildTradecardFromPages(startUrl, pages) {
  const domain = pickDomain(startUrl);

  // Aggregate links & images across pages
  const allLinks  = uniq(pages.flatMap(p => p.links  || []));
  const allImages = uniq(pages.flatMap(p => p.images || [])).filter(isHttp);

  // Aggregate socials/contacts from pages first; fallback to link scanning
  const pageSocials = pages.flatMap(p => p.social || []);
  const pageEmails  = pages.flatMap(p => (p.contacts?.emails || []));
  const pagePhones  = pages.flatMap(p => (p.contacts?.phones || []));

  const linksSocials = uniq(
    allLinks.map(detectSocial).filter(Boolean).map(s => `${s.platform}:${s.url}`)
  ).map(s => { const [platform, url] = s.split(':'); return { platform, url }; });

  const social = pageSocials.length ? uniq(pageSocials, s => `${s.platform}:${s.url}`) : linksSocials;
  const emails = pageEmails.length ? uniq(pageEmails) : uniq(allLinks.filter(l => l.startsWith('mailto:')).map(l => l.replace(/^mailto:/i,'')));
  const phones = pagePhones.length ? uniq(pagePhones) : uniq(allLinks.filter(l => l.startsWith('tel:')).map(l => l.replace(/^tel:/i,'')));

  // Business name from the home page title, else domain
  const home = pages.find(p => pickDomain(p.url) === domain);
  const businessName =
    (home?.title || '')
      .replace(/\s*\|\s*.*/,'')
      .replace(/\s*-\s*.*/,'')
      .trim() || domain;

  // Logo & hero
  const logo = detectLogo(allImages);
  const hero = pickHero(allImages);

  // Headings (flatten with provenance)
  const headings = pages.flatMap(p => {
    const tags = [];
    for (const level of ['h1','h2','h3']) {
      (p.headings?.[level] || []).forEach(text => tags.push({ level, text, url: p.url }));
    }
    return tags;
  });

  const needs_inference = [
    'business.description',
    'services.list',
    'service_areas',
    'brand.tone',
    'testimonials',
  ];

  return {
    site: {
      url: startUrl,
      domain,
      crawled_at: new Date().toISOString(),
      pages_count: pages.length,
    },
    tradecard: {
      business: {
        name: businessName,
        abn: null,              // (optional) fill via ABN lookup later
        description: null,      // LLM later
      },
      contacts: {
        emails,
        phones,
        website: startUrl,
      },
      social,                   // [{platform,url}]
      assets: {
        logo,
        hero,
        images: allImages.slice(0, 200), // payload cap
      },
      content: { headings },
      services: { list: null },         // LLM later
      service_areas: null,              // LLM later
      brand: { tone: null, colors: null },
      testimonials: null,
    },
    provenance: {
      start_url: startUrl,
      pages: pages.map(p => ({ url: p.url, title: p.title, images: (p.images||[]).length })),
      extraction: {
        social_from_links: true,
        contacts_from_mailto_tel: true,
        logo_heuristic: 'filename:logo/icon/mark preference',
        hero_heuristic: 'filename hero/banner or large cdn hints',
      }
    },
    needs_inference,
  };
}

module.exports = async function handler(req, res) {
  try {
    const startUrl = req.query?.url;
    if (!startUrl) return res.status(400).json({ error: 'Missing ?url=' });

    let u; try { u = new URL(startUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return res.status(400).json({ error: 'URL must use http/https' });

    const maxPages = Math.min(parseInt(req.query?.maxPages || '12', 10) || 12, 50);
    const maxDepth = Math.min(parseInt(req.query?.maxDepth || '2', 10) || 2, 5);
    const sameOrigin = (req.query?.sameOrigin ?? '1') !== '0';

    let pages = await crawlSite(u.toString(), { maxPages, maxDepth, sameOriginOnly: sameOrigin });

    // Always try to include at least the start page
    if (pages.length === 0) {
      try { const { page } = await scrapePage(u.toString()); pages.push(page); } catch {}
    }

    const result = buildTradecardFromPages(u.toString(), pages);

    // Optional: persist to BostonOS if token present
    const token = process.env.BOSTONOS_API_TOKEN;
    if (token && (req.query?.save ?? '1') !== '0') {
      try {
        const slug = (u.hostname || 'site').replace(/^www\./,'').replace(/\./g,'_').toLowerCase();
        const key = `mk4/capsules/profile_generator/data/profiles/${slug}_tradecard.json`;
        const saveRes = await fetch('https://bostonos-runtime-api.yellow-rice-fbef.workers.dev/tradecard/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ key, content: JSON.stringify(result) })
        });
        result.persisted = saveRes.ok ? { bostonos_key: key } : { error: await saveRes.text() };
      } catch (e) {
        result.persisted = { error: e.message };
      }
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};
