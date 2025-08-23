// lib/llm_resolver.js
// Resolve missing intent fields using an LLM chat completion.

const { tryParseAssistant } = require('./infer');

function pruneTradecard(tc = {}) {
  const out = {};
  if (tc.business) out.business = tc.business;
  if (tc.contacts) out.contacts = tc.contacts;
  if (tc.social) out.social = tc.social;
  if (tc.services && Array.isArray(tc.services.list)) {
    out.services = { list: tc.services.list.slice(0, 3) };
  }
  if (tc.address) out.address = tc.address;
  if (tc.assets) out.assets = tc.assets;
  if (tc.testimonials) out.testimonials = tc.testimonials;
  return out;
}

function pruneRaw(raw = {}) {
  const out = {};
  if (Array.isArray(raw.headings)) out.headings = raw.headings.slice(0, 10);
  if (Array.isArray(raw.paragraphs)) out.paragraphs = raw.paragraphs.slice(0, 10);
  if (Array.isArray(raw.images)) out.images = raw.images.slice(0, 10);
  return out;
}
async function resolveWithLLM({ tradecard = {}, raw = {}, intentDoc = {}, allowKeys = [], mode } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const keys = Array.isArray(allowKeys) ? allowKeys : Array.from(allowKeys || []);
  if (!apiKey || keys.length === 0) return { fields: {}, audit: [] };

  const pruned = pruneTradecard(tradecard);
  const prunedRaw = pruneRaw(raw);
  const rules = {};
  for (const k of keys) {
    if (intentDoc[k]) {
      const { transforms, constraints } = intentDoc[k];
      rules[k] = {};
      if (transforms) rules[k].transforms = transforms;
      if (constraints) rules[k].constraints = constraints;
    }
  }

  const user = {
    allowKeys: keys,
    transforms: ['trim', 'lower', 'digits', 'csv'],
    constraints: ['min_length', 'no_generic_terms'],
    tradecard: pruned,
    raw: prunedRaw
  };
  if (Object.keys(rules).length) user.rules = rules;
  if (mode) user.mode = mode;

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
        messages: [
          {
            role: 'system',
            content:
              'You output ONLY valid JSON. Keys must be in the provided allowlist. Values must be strings. Omit unknown/empty.'
          },
          { role: 'user', content: JSON.stringify(user) }
        ],
        temperature: 0,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
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
  const audit = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (!keys.includes(k)) continue;
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    fields[k] = s;
    audit.push({ key: k, source: 'llm' });
  }

  return { fields, audit };
}

module.exports = { resolveWithLLM };

