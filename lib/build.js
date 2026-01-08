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

async function fetchSitemapUrls(startUrl, { sameOriginOnly = true, maxUrls = 200, maxSitemaps = 5 } = {}) {
  let origin;
  try {
    origin = new URL(startUrl).origin;
  } catch {
    return [];
  }
  const queue = [new URL('/sitemap.xml', origin).toString()];
  const visited = new Set();
  const urls = new Set();

  while (queue.length && visited.size < maxSitemaps && urls.size < maxUrls) {
    const sitemapUrl = queue.shift();
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    let xml;
    try {
      const resp = await fetch(sitemapUrl, {
        headers: { 'accept': 'application/xml,text/xml;q=0.9,*/*;q=0.5' }
      });
      if (!resp.ok) continue;
      xml = await resp.text();
    } catch {
      continue;
    }
    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/gi), (m) => m[1].trim());
    for (const loc of locs) {
      let abs;
      try {
        abs = new URL(loc, origin).toString();
      } catch {
        continue;
      }
      if (sameOriginOnly && !abs.startsWith(origin)) continue;
      if (loc.includes('.xml') && visited.size < maxSitemaps && queue.length < maxSitemaps) {
        if (!visited.has(abs)) queue.push(abs);
        continue;
      }
      urls.add(abs);
      if (urls.size >= maxUrls) break;
    }
  }
  return Array.from(urls);
}

function normalizeCrawlUrl(href) {
  try {
    const u = new URL(href);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

async function crawlSite(startUrl, { maxPages = 12, maxDepth = 2, sameOriginOnly = true, includeSitemap = true } = {}) {
  const origin = new URL(startUrl).origin;
  const visited = new Set();
  const queue = [[startUrl, 0]];
  const pages = [];

  if (includeSitemap) {
    const sitemapUrls = await fetchSitemapUrls(startUrl, {
      sameOriginOnly,
      maxUrls: Math.max(maxPages * 2, 50)
    });
    for (const href of sitemapUrls) {
      if (queue.length >= maxPages) break;
      queue.push([href, 0]);
    }
  }

  while (queue.length && pages.length < maxPages) {
    const [url, depth] = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const { page, scrape_metrics } = await scrapePage(url);
      page.scrape_metrics = scrape_metrics || null;
      pages.push(page);
      if (depth < maxDepth) {
        const next = (page.links || [])
          .map(normalizeCrawlUrl)
          .filter((href) => {
            if (!href) return false;
            if (sameOriginOnly && !href.startsWith(origin)) return false;
            if (!isHttp(href)) return false;
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
  const allImages = uniq(
    pages.flatMap(p => (p.images || []).map(i => i.url))
  ).filter(isHttp);

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

function buildAuditSnapshot(startUrl, pages, { raw = null } = {}) {
  const domain = pickDomain(startUrl);
  const pagesSafe = Array.isArray(pages) ? pages : [];
  const allLinks = pagesSafe.flatMap((p) => p.links || []);
  const allImages = pagesSafe.flatMap((p) => p.images || []);
  const allSocials = pagesSafe.flatMap((p) => p.social || []);
  const allEmails = pagesSafe.flatMap((p) => p.contacts?.emails || []);
  const allPhones = pagesSafe.flatMap((p) => p.contacts?.phones || []);
  const textBlocks = pagesSafe.flatMap((p) => p.text_blocks || []);
  const servicePanels = pagesSafe.flatMap((p) => p.service_panels || []);
  const testimonials = pagesSafe.flatMap((p) => p.testimonials || []);
  const projects = pagesSafe.flatMap((p) => p.projects || []);
  const profileVideos = pagesSafe.flatMap((p) => p.profile_videos || []);
  const contactForms = pagesSafe.flatMap((p) => p.contact_form_links || []);
  const awards = pagesSafe.flatMap((p) => p.awards || []);

  const totals = pagesSafe.reduce(
    (acc, page) => {
      acc.words += page.word_count || 0;
      acc.characters += page.character_count || 0;
      acc.images += page.image_count || (page.images || []).length;
      acc.links += Array.isArray(page.links) ? page.links.length : 0;
      acc.anchors += Array.isArray(page.anchors) ? page.anchors.length : 0;
      acc.scripts += page.script_count || 0;
      acc.stylesheets += page.stylesheet_count || 0;
      acc.jsonld += page.jsonld_count || 0;
      return acc;
    },
    {
      words: 0,
      characters: 0,
      images: 0,
      links: 0,
      anchors: 0,
      scripts: 0,
      stylesheets: 0,
      jsonld: 0
    }
  );

  return {
    site: {
      url: startUrl,
      domain,
      crawled_at: new Date().toISOString(),
      pages_count: pagesSafe.length
    },
    summary: {
      totals,
      unique: {
        links: uniq(allLinks).length,
        images: uniq(allImages, (img) => img.url || img).length,
        socials: uniq(allSocials, (s) => `${s.platform || 'unknown'}:${s.url || ''}`).length,
        emails: uniq(allEmails).length,
        phones: uniq(allPhones).length
      },
      signals: {
        text_blocks: textBlocks.length,
        service_panels: servicePanels.length,
        testimonials: testimonials.length,
        projects: projects.length,
        profile_videos: profileVideos.length,
        contact_form_links: contactForms.length,
        awards: awards.length
      }
    },
    pages: pagesSafe.map((page) => ({
      url: page.url,
      title: page.title || null,
      meta: page.meta || {},
      canonical_url: page.canonical_url || null,
      favicon_url: page.favicon_url || null,
      apple_touch_icon_url: page.apple_touch_icon_url || null,
      headings: page.headings || {},
      heading_counts: {
        h1: page.h1_count || 0,
        h2: page.h2_count || 0,
        h3: page.h3_count || 0,
        h4: page.h4_count || 0,
        h5: page.h5_count || 0,
        h6: page.h6_count || 0
      },
      text_blocks: page.text_blocks || [],
      layout_blocks: page.layout_blocks || [],
      word_count: page.word_count || 0,
      character_count: page.character_count || 0,
      first_paragraph_text: page.first_paragraph_text || null,
      first_image_url: page.first_image_url || null,
      links: page.links || [],
      anchors: page.anchors || [],
      images: page.images || [],
      social: page.social || [],
      contacts: page.contacts || { emails: [], phones: [] },
      jsonld: page.jsonld || [],
      microdata_itemtypes: page.microdata_itemtypes || [],
      text_signals: {
        testimonials: page.testimonials || [],
        service_panels: page.service_panels || [],
        projects: page.projects || [],
        profile_videos: page.profile_videos || [],
        contact_form_links: page.contact_form_links || [],
        awards: page.awards || []
      },
      scrape_metrics: page.scrape_metrics || null
    })),
    signals: {
      raw,
      identity: raw
        ? {
            business_name: raw.identity_business_name || null,
            owner_name: raw.identity_owner_name || null,
            role_title: raw.identity_role_title || null,
            address: raw.identity_address || null,
            suburb: raw.identity_suburb || null,
            state: raw.identity_state || null,
            insured: raw.identity_insured || null,
            email: raw.identity_email || null,
            phone: raw.identity_phone || null,
            website_url: raw.identity_website_url || null
          }
        : null
    }
  };
}

function collectRawFromPages(startUrl, pages) {
  const allPages = Array.isArray(pages) ? pages : [];
  const pickFirst = (key) => {
    for (const page of allPages) {
      const value = page?.[key];
      if (Array.isArray(value)) {
        if (value.length) return value;
      } else if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
    return null;
  };
  const mergeArray = (key) =>
    allPages.flatMap((page) => (Array.isArray(page?.[key]) ? page[key] : [])).filter(Boolean);

  const raw = {
    anchors: allPages.flatMap((p) => {
      if (Array.isArray(p?.anchors) && p.anchors.length) return p.anchors;
      return (p?.links || []).map((href) => ({ href, text: '' }));
    }),
    headings: allPages
      .flatMap((p) => Object.values(p.headings || {}))
      .flat()
      .map((t) => t || ''),
    images: allPages
      .flatMap((p) => p.images || [])
      .map((i) => ({ src: i.url || '', alt: i.alt || '' })),
    url: startUrl,
    meta: allPages?.[0]?.meta || {},
    jsonld: allPages?.[0]?.jsonld || allPages?.[0]?.schema || [],
    text_blocks: mergeArray('text_blocks'),
    service_panels: mergeArray('service_panels'),
    testimonials: mergeArray('testimonials'),
    projects: mergeArray('projects'),
    profile_videos: mergeArray('profile_videos'),
    contact_form_links: mergeArray('contact_form_links'),
    awards: mergeArray('awards'),
    social: mergeArray('social')
  };

  const identityKeys = [
    'identity_owner_name',
    'identity_role_title',
    'identity_headshot_url',
    'identity_logo_url',
    'identity_suburb',
    'identity_state',
    'identity_insured',
    'identity_business_name',
    'identity_address',
    'identity_email',
    'identity_phone',
    'identity_website_url',
    'identity_uri_phone',
    'identity_uri_email',
    'identity_uri_sms',
    'identity_uri_whatsapp',
    'identity_address_uri',
    'identity_services'
  ];

  for (const key of identityKeys) {
    const value = pickFirst(key);
    if (value !== null) raw[key] = value;
  }

  return raw;
}

module.exports = { crawlSite, buildTradecardFromPages, buildAuditSnapshot, collectRawFromPages };
