// lib/infer.js
// Deterministic inference for TradeCard fields using OpenAI chat completions.

function pickAllowed(src = {}) {
  const out = {};
  if (src.business && typeof src.business === 'object') {
    const desc = src.business.description;
    if (desc !== undefined) out.business = { description: desc };
  }
  if (src.services && typeof src.services === 'object') {
    const list = src.services.list;
    if (list !== undefined) out.services = { list };
  }
  if (src.service_areas !== undefined) out.service_areas = src.service_areas;
  if (src.brand && typeof src.brand === 'object') {
    const tone = src.brand.tone;
    if (tone !== undefined) out.brand = { tone };
  }
  if (src.testimonials !== undefined) out.testimonials = src.testimonials;
  return out;
}

async function inferTradecard(tradecard = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { _meta: { error: 'missing_key' } };

  const summary = {
    name: tradecard?.business?.name,
    headings: (tradecard?.content?.headings || []).slice(0, 30),
    contacts: tradecard?.contacts,
    images: (tradecard?.assets?.images || []).slice(0, 5)
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
        messages: [
          { role: 'system', content: 'Output ONLY JSON with the specified schema.' },
          { role: 'user', content: `Fill missing fields for: ${JSON.stringify(summary)}` }
        ],
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });
    data = await res.json().catch(err => ({ parse_error: err.message }));
  } catch (err) {
    clearTimeout(timeout);
    return { _meta: { error: err.message || String(err) } };
  }
  clearTimeout(timeout);

  if (!res.ok) {
    return { _meta: { error: 'bad_status', status: res.status, detail: data } };
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    return { _meta: { error: 'no_content', detail: data } };
  }
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (err) { return { _meta: { error: 'invalid_json', detail: content } }; }

  return pickAllowed(parsed);
}

module.exports = { inferTradecard };
