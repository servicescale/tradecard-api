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

module.exports.resolveField = async function resolveField(key, rule = {}, { raw = {}, tradecard = {} } = {}) {
  const payload = {
    links: (raw.anchors || []).slice(0, 50).map((a) => ({ href: a.href || '', text: a.text || '' })),
    headings: (raw.headings || []).slice(0, 25).map((h) => h.text || h),
    images: (raw.images || []).slice(0, 30).map((i) => ({ src: i.src || '', alt: i.alt || '' })),
    hints: {
      name: tradecard?.business?.name || '',
      website: tradecard?.contacts?.website || ''
    },
    instructions: rule?.llm?.prompt || ''
  };
  let s = (await callOpenAI(payload)).trim();
  const v = rule?.llm?.validate || {};
  if (s && v.regex) {
    const rx = new RegExp(v.regex.replace(/^\/|\/$/g, ''), 'i');
    if (!rx.test(s)) s = '';
  }
  if (s && v.url && !/^https?:\/\//i.test(s)) s = '';
  if (s && v.min_len && s.length < v.min_len) s = '';
  if (s && v.max_len && s.length > v.max_len) s = s.slice(0, v.max_len);
  return s;
};
