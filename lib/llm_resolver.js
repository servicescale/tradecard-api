// lib/llm_resolver.js
// Resolve fields using an LLM based on raw crawl data.

const { tryParseAssistant } = require('./infer');

function buildHints(raw = {}) {
  const links = Array.isArray(raw.links) ? raw.links : [];
  let phone, email;
  for (const href of links) {
    if (!phone && /^tel:/i.test(href)) {
      phone = href.replace(/^tel:/i, '').trim();
    }
    if (!email && /^mailto:/i.test(href)) {
      email = href.replace(/^mailto:/i, '').trim();
    }
    if (phone && email) break;
  }
  const hints = {};
  if (phone) hints.AU_phone = phone;
  if (email) hints.email = email;
  if (raw.url) hints.url = raw.url;
  return hints;
}

function compactRaw(raw = {}) {
  const out = {};
  if (Array.isArray(raw.headings)) out.headings = raw.headings.slice(0, 20);
  if (Array.isArray(raw.paragraphs)) out.paragraphs = raw.paragraphs.slice(0, 20);
  if (Array.isArray(raw.links)) out.links = raw.links.slice(0, 50);
  if (Array.isArray(raw.images)) out.images = raw.images.slice(0, 30);
  if (raw.meta !== undefined) out.meta = raw.meta;
  if (raw.schema !== undefined) out.schema = raw.schema;
  return out;
}

async function resolveWithLLM({ raw = {}, allowKeys = [] } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !Array.isArray(allowKeys) || allowKeys.length === 0) {
    return { fields: {}, audit: [] };
  }

  const user = {
    allowKeys,
    hints: buildHints(raw),
    raw: compactRaw(raw)
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
              'Return ONLY valid JSON; keys must be from allowKeys; values must be strings; omit empty.'
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
    if (!allowKeys.includes(k)) continue;
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    fields[k] = s;
  }
  const audit = Object.keys(fields).map((k) => ({ key: k, source: 'llm' }));

  return { fields, audit };
}

module.exports = { resolveWithLLM };
