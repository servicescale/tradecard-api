// lib/fetch_html.js
// Fetch HTML with simple protocol guards and fallback to http/www.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

async function fetchHtml(url, { timeoutMs = 12000 } = {}) {
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
    return { html, url: pageUrl.toString() };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchHtml, ALLOWED_PROTOCOLS };
