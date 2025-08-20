// /api/scrape.js
// Single-page scraper with CSS/background-image support + socials + contacts.
// Exposes both an API handler (exports.default) and a callable function (exports.scrapePage).

const cheerio = require('cheerio');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const isHttp = (u) => { try { return ALLOWED_PROTOCOLS.has(new URL(u).protocol); } catch { return false; } };

// ---------- CSS helpers ----------
function* extractCssUrls(cssText = '') {
  const re = /url\(\s*(['"]?)([^"'()]+)\1\s*\)/ig;
  let m; while ((m = re.exec(cssText)) !== null) yield m[2];
}
function* extractImports(cssText = '') {
  const re = /@import\s+(?:url\(\s*)?['"]?([^"'()]+)['"]?\s*\)?/ig;
  let m; while ((m = re.exec(cssText)) !== null) yield m[1];
}

async function fetchTextWithGuards(url, { timeoutMs = 8000, byteLimit = 512_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'text/css,*/*;q=0.1',
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let size = 0, chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > byteLimit) throw new Error('SIZE_LIMIT');
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally { clearTimeout(timer); }
}

async function collectCssAssets(entryUrls, baseForResolve, { maxFiles = 20, maxDepth = 2 } = {}) {
  const queue = [];
  for (const href of entryUrls) {
    try { queue.push(new URL(href, baseForResolve).toString()); } catch {}
  }
  const visited = new Set();
  const assets = new Set();
  let remainingDepth = maxDepth;

  while (queue.length && visited.size < maxFiles) {
    const cssUrl = queue.shift();
    if (visited.has(cssUrl)) continue;
    visited.add(cssUrl);

    let css; try { css = await fetchTextWithGuards(cssUrl); } catch { continue; }

    for (const raw of extractCssUrls(css)) {
      try {
        const abs = new URL(raw, cssUrl).toString();
        if (isHttp(abs)) assets.add(abs);
      } catch {}
    }

    if (remainingDepth > 0 && visited.size < maxFiles) {
      for (const imp of extractImports(css)) {
        try {
          const abs = new URL(imp, cssUrl).toString();
          if (!visited.has(abs)) queue.push(abs);
        } catch {}
      }
      remainingDepth -= 1;
    }
  }
  return Array.from(assets);
}

// ---------- main scraper ----------
async function scrapePage(url) {
  // Validate
  let pageUrl;
  try { pageUrl = new URL(url); } catch { throw new Error('Invalid URL'); }
  if (!ALLOWED_PROTOCOLS.has(pageUrl.protocol)) throw new Error('URL must use http/https');

  // Fetch HTML with small recovery to http / www.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

  async function tryFetch(urlStr) {
    const resp = await fetch(urlStr, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!resp.ok) throw new Error(`Upstream ${resp.status}`);
    return resp;
  }

  let html;
  try {
    let resp;
    try {
      resp = await tryFetch(pageUrl.toString());
    } catch (e1) {
      const fallbacks = [];
      if (pageUrl.protocol === 'https:') {
        const httpAlt = new URL(pageUrl.toString()); httpAlt.protocol = 'http:'; fallbacks.push(httpAlt.toString());
      }
      if (!/^www\./i.test(pageUrl.hostname)) {
        const withWww = new URL(pageUrl.toString()); withWww.hostname = `www.${withWww.hostname}`; fallbacks.push(withWww.toString());
      }
      let success = null;
      for (const alt of fallbacks) {
        try { resp = await tryFetch(alt); success = alt; break; } catch {}
      }
      if (!resp) throw e1;
      if (success) pageUrl = new URL(success);
    }
    html = await resp.text();
  } finally { clearTimeout(timer); }

  const $ = cheerio.load(html);
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();

  // base href (resolve context)
  let baseForResolve = pageUrl.toString();
  const baseHref = $('base[href]').attr('href');
  if (baseHref) { try { baseForResolve = new URL(baseHref, pageUrl).toString(); } catch {} }

  // Title + headings
  const title = ($('title').first().text() || '').trim() || null;
  const headings = {
    h1: $('h1').map((_, el) => norm($(el).text())).get().filter(Boolean),
    h2: $('h2').map((_, el) => norm($(el).text())).get().filter(Boolean),
    h3: $('h3').map((_, el) => norm($(el).text())).get().filter(Boolean),
  };

  // Images
  const images = [];
  const seen = new Set();
  const add = (u, base = baseForResolve) => {
    if (!u) return;
    try {
      const abs = new URL(u, base).toString();
      if (isHttp(abs) && !seen.has(abs)) { seen.add(abs); images.push(abs); }
    } catch {}
  };

  // <img> + lazy + srcset
  $('img').each((_, el) => {
    const $el = $(el);
    add($el.attr('src'));
    add($el.attr('data-src'));
    add($el.attr('data-lazy-src'));
    add($el.attr('data-original'));
    const srcset = $el.attr('srcset');
    if (srcset) srcset.split(',').forEach(p => add(p.trim().split(/\s+/)[0]));
  });

  // Inline background images
  $('[style*="background"]').each((_, el) => {
    for (const u of extractCssUrls($(el).attr('style') || '')) add(u);
  });
  // <style> blocks
  $('style').each((_, el) => {
    for (const u of extractCssUrls($(el).html() || '')) add(u);
  });
  // External stylesheets + @import (depth 2, max 20 files)
  const sheetHrefs = $('link[href]').filter((_, el) => {
    const rel = (($(el).attr('rel') || '') + '').toLowerCase();
    return /\bstylesheet\b/.test(rel) || (/\b(preload|prefetch)\b/.test(rel) && ($(el).attr('as') || '') === 'style');
  }).map((_, el) => $(el).attr('href')).get();

  const importsInline = [];
  $('style').each((_, el) => {
    for (const imp of extractImports($(el).html() || '')) importsInline.push(imp);
  });

  const cssAssets = await collectCssAssets(Array.from(new Set([...sheetHrefs, ...importsInline])), baseForResolve, { maxFiles: 20, maxDepth: 2 });
  cssAssets.forEach(u => add(u, pageUrl.toString()));

  // Helpful extras
  add($('link[rel="icon"]').attr('href'));
  add($('link[rel="apple-touch-icon"]').attr('href'));
  add($('meta[property="og:image"]').attr('content'));
  add($('meta[name="twitter:image"]').attr('content'));

  // Links (absolute)
  const links = $('a[href]')
    .map((_, el) => {
      try { return new URL($(el).attr('href'), baseForResolve).toString(); } catch { return null; }
    })
    .get()
    .filter(Boolean);

  // --- NEW: socials + contacts (deterministic from links) ---
  const socials = [];
  const emails = [];
  const phones = [];

  for (const href of links) {
    if (!href) continue;
    const low = href.toLowerCase();

    // contacts
    if (low.startsWith('mailto:')) {
      const addr = href.replace(/^mailto:/i, '').trim();
      if (addr) emails.push(addr);
      continue;
    }
    if (low.startsWith('tel:')) {
      const tel = href.replace(/^tel:/i, '').trim();
      if (tel) phones.push(tel);
      continue;
    }

    // socials
    const platform =
      low.includes('facebook.com')  ? 'facebook'  :
      low.includes('instagram.com') ? 'instagram' :
      (low.includes('x.com') || low.includes('twitter.com')) ? 'twitter' :
      low.includes('linkedin.com')  ? 'linkedin'  :
      (low.includes('youtube.com') || low.includes('youtu.be')) ? 'youtube' :
      low.includes('tiktok.com')    ? 'tiktok'    :
      null;

    if (platform) socials.push({ platform, url: href });
  }

  // de-dupers
  const uniqBy = (arr, keyer) => Array.from(new Map(arr.map(v => [keyer(v), v])).values());
  const uniqueSocials = uniqBy(socials, s => `${s.platform}:${s.url}`);
  const uniqueEmails  = Array.from(new Set(emails));
  const uniquePhones  = Array.from(new Set(phones));

  return {
    page: {
      url: pageUrl.toString(),
      title,
      headings,
      images,
      links,
      social: uniqueSocials,                  // [{platform, url}]
      contacts: { emails: uniqueEmails, phones: uniquePhones },
    },
  };
}

// programmatic export for the crawler / builder
exports.scrapePage = scrapePage;

// API route export
exports.default = async function handler(req, res) {
  const url = (req.query && req.query.url) || null;
  if (!url) return res.status(400).json({ error: 'Missing ?url=' });

  try {
    const data = await scrapePage(url);

    // Optional limits (query flags) for payload hygiene
    const limit = parseInt(req.query?.limitImages || '0', 10);
    if (limit > 0 && Array.isArray(data.page.images)) {
      data.page.images = data.page.images.slice(0, limit);
    }

    const cssMaxFiles = Math.min(parseInt((req.query?.cssMaxFiles)||'20',10)||20, 50);
    const cssMaxDepth = Math.min(parseInt((req.query?.cssMaxDepth)||'2',10)||2, 3);
    // (Note: these flags are read inside collectCssAssets via the default values above;
    // kept here for interface compatibility if you later thread them through.)

    res.status(200).json(data);
  } catch (err) {
    const status = /Invalid URL|http\/https/.test(err.message) ? 400 : 502;
    res.status(status).json({ error: err.message || 'Scrape failed' });
  }
};
