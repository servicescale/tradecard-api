// lib/fetch_html.js
// Fetch HTML with simple protocol guards and fallback to http/www. When a page
// appears to rely heavily on client-side rendering, fall back to a headless
// browser (Playwright) to obtain the fully rendered markup.

const cheerio = require('cheerio');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Heuristic to determine if a page likely requires JS rendering. */
function needsRendering(rawHtml) {
  try {
    const $ = cheerio.load(rawHtml);
    const body = $('body').clone();
    body.find('script,style,noscript').remove();
    const text = body.text().trim();
    if (!text && body.children().length === 0) return true; // empty body

    const bundleRe = /(bundle|webpack|main|chunk|app)\.\w+\.js/i;
    const scripts = $('script[src]').map((_, el) => $(el).attr('src') || '').get();
    return scripts.some(src => {
      const name = (src.split('?')[0].split('/').pop() || '');
      return bundleRe.test(name) || name.length > 30;
    });
  } catch {
    return false;
  }
}

/**
 * Fetch a page using a headless browser to render dynamic content. Tries
 * Puppeteer first and falls back to Playwright if available. At least one of
 * these libraries must be installed by the consuming project.
 */
async function fetchRenderedHtml(url, { timeoutMs = 20000 } = {}) {
  // Attempt Puppeteer
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new' });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0', timeout: timeoutMs });
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch (e1) {
    // Fallback to Playwright if Puppeteer unavailable
    try {
      const { chromium } = require('playwright');
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
        return await page.content();
      } finally {
        await browser.close();
      }
    } catch {
      throw e1;
    }
  }
}

async function fetchHtml(url, { timeoutMs = 12000, headlessTimeoutMs = 20000 } = {}) {
  let pageUrl;
  try { pageUrl = new URL(url); } catch { throw new Error('Invalid URL'); }
  if (!ALLOWED_PROTOCOLS.has(pageUrl.protocol)) throw new Error('URL must use http/https');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

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

  try {
    let resp;
    try {
      resp = await tryFetch(pageUrl.toString());
    } catch (e1) {
      const fallbacks = [];
      if (pageUrl.protocol === 'https:') {
        const httpAlt = new URL(pageUrl.toString());
        httpAlt.protocol = 'http:';
        fallbacks.push(httpAlt.toString());
      }
      if (!/^www\./i.test(pageUrl.hostname)) {
        const withWww = new URL(pageUrl.toString());
        withWww.hostname = `www.${withWww.hostname}`;
        fallbacks.push(withWww.toString());
      }
      let success = null;
      for (const alt of fallbacks) {
        try { resp = await tryFetch(alt); success = alt; break; } catch {}
      }
      if (!resp) throw e1;
      if (success) pageUrl = new URL(success);
    }

    const html = await resp.text();
    if (needsRendering(html)) {
      try {
        const rendered = await fetchRenderedHtml(pageUrl.toString(), { timeoutMs: headlessTimeoutMs });
        return { html: rendered, url: pageUrl.toString() };
      } catch {
        // If headless fails, fall back to original HTML
      }
    }
    return { html, url: pageUrl.toString() };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchHtml, fetchRenderedHtml, ALLOWED_PROTOCOLS };
