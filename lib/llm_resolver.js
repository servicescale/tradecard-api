"use strict";

async function callOpenAI(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return '';
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
        response_format: { type: 'text' },
        messages: [
          { role: 'system', content: 'Return ONLY the value as plain text. No extra words.' },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      })
    });
    const data = await res.json().catch(() => ({}));
    return data?.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  }
}

const batchCache = new Map();

module.exports.resolveField = async function resolveField(
  key,
  rule = {},
  { raw = {}, tradecard = {}, fields = {} } = {}
) {
  const llmRule = rule.llm || {};
  const batchKey = llmRule.batch ? llmRule.prompt || key : null;
  if (batchKey && batchCache.has(batchKey)) {
    const cached = batchCache.get(batchKey);
    return cached[key] || '';
  }

  const payload = {
    links: (raw.anchors || []).slice(0, 50).map((a) => ({ href: a.href || '', text: a.text || '' })),
    headings: (raw.headings || []).slice(0, 25).map((h) => h.text || h),
    images: (raw.images || []).slice(0, 30).map((i) => ({ src: i.src || '', alt: i.alt || '' })),
    text_blocks: (raw.text_blocks || [])
      .slice(0, 100)
      .map((t) => String(t).slice(0, 200)),
    meta: raw.meta || {},
    jsonld: raw.jsonld || [],
    service_panels: Array.isArray(raw.service_panels)
      ? raw.service_panels.slice(0, 10)
      : [],
    projects: Array.isArray(raw.projects) ? raw.projects.slice(0, 10) : [],
    hints: {
      name: tradecard?.business?.name || '',
      website: tradecard?.contacts?.website || ''
    },
    instructions: llmRule.prompt || ''
  };

  if (llmRule.batch) {
    const keys = Array.isArray(llmRule.keys) ? llmRule.keys : [key];
    payload.keys = keys;
  }

  let rawRes = (await callOpenAI(payload)).trim();
  if (llmRule.batch) {
    let obj;
    try {
      obj = JSON.parse(rawRes);
    } catch {
      obj = { [key]: rawRes };
    }
    batchCache.set(batchKey, obj);
    rawRes = obj[key] || '';
  }

  let s = rawRes;
  const v = llmRule.validate || {};
  if (s && v.regex) {
    const rx = new RegExp(v.regex.replace(/^\/|\/$/g, ''), 'i');
    if (!rx.test(s)) s = '';
  }
  if (s && v.url && !/^https?:\/\//i.test(s)) s = '';
  if (s && v.min_len && s.length < v.min_len) s = '';
  if (s && v.max_len && s.length > v.max_len) s = s.slice(0, v.max_len);
  return s;
};
