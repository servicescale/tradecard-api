"use strict";

async function callOpenAI(payload) {
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
          { role: 'system', content: 'Return JSON {value:string,confidence:number} for requested fields.' },
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

const batchCache = new Map();

function defaultPrompt(k = '') {
  if (k === 'business_description') {
    return 'Write a concise 20+ word description of the business based on the provided content. Return JSON {value:string,confidence:number}.';
  }
  if (k === 'testimonial_quote') {
    return 'Produce a 20+ word positive testimonial quote based on the provided reviews or content. Return JSON {value:string,confidence:number}.';
  }
  const m = k.match(/^service_(\d+)_description$/);
  if (m) {
    return `Write a 30+ word description for service ${m[1]} using the provided site content. Return JSON {value:string,confidence:number}.`;
  }
  return 'Return JSON {value:string,confidence:number}.';
}

module.exports.resolveField = async function resolveField(
  key,
  rule = {},
  { raw = {}, tradecard = {}, fields = {}, unresolved = [], snippet = '' } = {},
) {
  const llmRule = rule.llm || {};
  const prompt = llmRule.prompt || defaultPrompt(key);
  const batchKey = llmRule.batch ? prompt || key : null;
  if (batchKey && batchCache.has(batchKey)) {
    const cached = batchCache.get(batchKey);
    return cached[key] || '';
  }

  const payload = {
    unresolved_fields: Array.isArray(unresolved) ? unresolved : [],
    context_snippet: snippet,
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
    instructions: prompt || ''
  };

  if (llmRule.batch) {
    const keys = Array.isArray(llmRule.keys) ? llmRule.keys : [key];
    payload.keys = keys;
  }

  let rawRes = (await callOpenAI(payload)).trim();
  let data;
  if (llmRule.batch) {
    let obj;
    try {
      obj = JSON.parse(rawRes);
    } catch {
      obj = {};
    }
    batchCache.set(batchKey, obj);
    data = obj[key];
  } else {
    try {
      data = JSON.parse(rawRes);
    } catch {
      data = rawRes;
    }
  }

  let s = '';
  let confidence = 1;
  if (data && typeof data === 'object') {
    s = typeof data.value === 'string' ? data.value : '';
    confidence = Number.isFinite(data.confidence) ? Number(data.confidence) : 1;
  } else {
    s = String(data || '');
  }

  const threshold = llmRule.confidence_threshold ?? 0.7;
  if (confidence < threshold) s = '';

  const v = llmRule.validate || {};
  if (s && v.regex) {
    const rx = new RegExp(v.regex.replace(/^\/|\/$/g, ''), 'i');
    if (!rx.test(s)) s = '';
  }
  if (s && v.url && !/^https?:\/\//i.test(s)) s = '';
  if (s && v.min_len && s.length < v.min_len) s = '';
  if (s && v.max_len && s.length > v.max_len) s = s.slice(0, v.max_len);
  if (s && v.min_words) {
    const wc = s.trim().split(/\s+/).filter(Boolean).length;
    if (wc < v.min_words) s = '';
  }
  if (s && v.max_words) {
    const parts = s.trim().split(/\s+/).filter(Boolean);
    if (parts.length > v.max_words) s = parts.slice(0, v.max_words).join(' ');
  }
  return s;
};

