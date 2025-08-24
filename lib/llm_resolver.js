// lib/llm_resolver.js
// Resolve fields using an LLM based on raw crawl data and extracted hints.

const { tryParseAssistant } = require('./infer');

function pruneRaw(raw = {}) {
  const out = {};
  if (Array.isArray(raw.headings)) out.headings = raw.headings.slice(0, 20);
  if (Array.isArray(raw.paragraphs)) out.paragraphs = raw.paragraphs.slice(0, 20);
  const links = Array.isArray(raw.anchors)
    ? raw.anchors
    : Array.isArray(raw.links)
    ? raw.links.map((l) => ({ href: l }))
    : [];
  if (links.length) {
    out.links = links.slice(0, 50).map((l) => ({ href: l.href || '', text: l.text || '' }));
  }
  if (Array.isArray(raw.images)) {
    out.images = raw.images.slice(0, 30).map((img) => ({ src: img.src || img, alt: img.alt || '' }));
  }
  if (raw.meta && typeof raw.meta.description === 'string') {
    out.meta = { description: raw.meta.description };
  }
  if (raw.jsonld) {
    out.jsonld = raw.jsonld;
  }
  return out;
}

async function resolveWithLLM({ raw = {}, allowKeys = new Set(), hints = {} } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !(allowKeys instanceof Set) || allowKeys.size === 0) {
    return { fields: {}, audit: [] };
  }

  const user = {
    allowKeys: Array.from(allowKeys),
    hints,
    raw_pruned: pruneRaw(raw)
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res, data;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Return ONLY valid JSON. Keys must be from allowKeys. Values must be strings. Omit empty.'
          },
          { role: 'user', content: JSON.stringify(user) }
        ]
      }),
      signal: controller.signal
    });
    data = await res.json().catch((err) => ({ parse_error: err.message }));
  } catch (err) {
    clearTimeout(timeout);
    return { fields: {}, audit: [], error: err.message || String(err) };
  }
  clearTimeout(timeout);

  if (!res.ok) {
    return { fields: {}, audit: [], error: 'bad_status', status: res.status, detail: data };
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) return { fields: {}, audit: [], error: 'no_content', detail: data };

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = tryParseAssistant(content);
  }
  if (!parsed || typeof parsed !== 'object') return { fields: {}, audit: [], error: 'invalid_json' };

  const fields = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (!allowKeys.has(k)) continue;
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    fields[k] = s;
  }
  const audit = Object.keys(fields).map((k) => ({ key: k, source: 'llm' }));

  return { fields, audit };
}

module.exports = { resolveWithLLM };

