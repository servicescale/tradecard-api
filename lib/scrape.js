// lib/scrape.js
// Fetches HTML and parses it into structured page data.

const { fetchHtml } = require('./fetch_html');
const { parse } = require('./parse');

async function scrapePage(url) {
  const { html, url: finalUrl } = await fetchHtml(url);
  const page = await parse(html, finalUrl);
  return { page };
}

module.exports = { scrapePage };
