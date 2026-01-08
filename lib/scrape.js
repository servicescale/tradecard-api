// lib/scrape.js
// Fetches HTML and parses it into structured page data.

const { fetchHtml } = require('./fetch_html');
const { parse } = require('./parse');

async function scrapePage(url, options = {}) {
  const metrics = {
    timings_ms: {},
    sizes: {},
    counts: {},
    flags: {}
  };
  const totalStart = Date.now();
  const fetchStart = Date.now();
  const { html, url: finalUrl, rendered } = await fetchHtml(url);
  metrics.timings_ms.fetch = Date.now() - fetchStart;
  metrics.flags.used_rendered_html = Boolean(rendered);
  metrics.sizes.html_bytes = Buffer.byteLength(html || '', 'utf8');

  const meta = {};
  const parseStart = Date.now();
  const page = await parse(html, finalUrl, { meta });
  metrics.timings_ms.parse = Date.now() - parseStart;
  metrics.timings_ms.total = Date.now() - totalStart;

  const textBlocks = Array.isArray(page.text_blocks) ? page.text_blocks : [];
  const textBlocksCharacters = textBlocks.reduce((sum, text) => sum + text.length, 0);
  metrics.sizes.body_text_characters = page.character_count || 0;
  metrics.sizes.body_text_words = page.word_count || 0;
  metrics.sizes.text_blocks_characters = textBlocksCharacters;
  metrics.counts.text_blocks = textBlocks.length;
  metrics.counts.images = page.image_count || 0;
  metrics.counts.links = Array.isArray(page.links) ? page.links.length : 0;
  metrics.counts.anchors = Array.isArray(page.anchors) ? page.anchors.length : 0;
  metrics.counts.scripts = page.script_count || 0;
  metrics.counts.stylesheets = page.stylesheet_count || 0;
  metrics.counts.jsonld = page.jsonld_count || 0;

  const response = { page, scrape_metrics: metrics };
  if (options.includeRaw) {
    response.raw = {
      html,
      text: meta.bodyText || ''
    };
  }
  return response;
}

module.exports = { scrapePage };
