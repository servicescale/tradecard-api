"use strict";

async function callLLM(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return '{}';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
          { role: 'system', content: 'Extract data and return only valid JSON.' },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      })
    });
    const data = await res.json().catch(() => ({}));
    return data?.choices?.[0]?.message?.content || '{}';
  } catch {
    return '{}';
  }
}

function prepareRaw(raw = {}) {
  const buckets = {
    anchors: raw.anchors || [],
    headings: raw.headings || [],
    images: raw.images || [],
    jsonld: raw.jsonld || [],
    meta: raw.meta || {}
  };
  let out = buckets;
  const MAX_BYTES = 12000;
  let bytes = Buffer.byteLength(JSON.stringify(out));
  if (bytes > MAX_BYTES) {
    out = {
      anchors: buckets.anchors.slice(0, 50),
      headings: buckets.headings.slice(0, 50),
      images: buckets.images.slice(0, 50),
      jsonld: buckets.jsonld.slice(0, 20),
      meta: Object.fromEntries(Object.entries(buckets.meta).slice(0, 20)),
      counts: {
        anchors: buckets.anchors.length,
        headings: buckets.headings.length,
        images: buckets.images.length,
        jsonld: buckets.jsonld.length,
        meta: Object.keys(buckets.meta).length
      }
    };
    bytes = Buffer.byteLength(JSON.stringify(out));
  }
  return { raw: out, bytes };
}

async function fullFramePropose({ raw = {}, intentMap = {}, resolveConfig = {}, allowKeys = [], fixture = '' }) {
  const { raw: safeRaw, bytes } = prepareRaw(raw);
  const fieldIntent = {};
  for (const k of allowKeys) if (intentMap[k]) fieldIntent[k] = intentMap[k];
  const resolveCfg = {};
  for (const k of allowKeys) if (resolveConfig[k]) resolveCfg[k] = resolveConfig[k];

  const prompt = {
    fixture,
    ALLOW_KEYS: allowKeys,
    RAW: safeRaw,
    FIELD_INTENT: fieldIntent,
    RESOLVE_CONFIG: resolveCfg,
    INSTRUCTION: 'Return a flat JSON object of {key: value} for keys ∈ allowKeys only. No new keys. Prefer exact strings from RAW; synthesize only when necessary and validate shape (email/phone/url/len). Return empty string for unknown.'
  };
  const inputStr = JSON.stringify(prompt);
  const tokens = Math.ceil(Buffer.byteLength(inputStr) / 4);
  const rawRes = await callLLM(prompt);
  let obj;
  try { obj = JSON.parse(rawRes); } catch { obj = {}; }
  const proposals = {};
  for (const [k, v] of Object.entries(obj)) {
    proposals[k] = v === null || v === undefined ? '' : String(v);
  }
  return { proposals, stats: { proposed_count: Object.keys(proposals).length, bytes_in: Buffer.byteLength(inputStr), tokens_est: tokens } };
}

module.exports = { fullFramePropose };
