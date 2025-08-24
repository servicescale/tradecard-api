// lib/infer.js
// Deterministic inference for TradeCard fields using OpenAI chat completions.

function wrap(v) {
  if (v === undefined) return undefined;
  if (v && typeof v === 'object' && 'value' in v && typeof v.confidence === 'number') {
    return v;
  }
  return { value: v, confidence: 0.5 };
}

function pickAllowed(src = {}) {
  const out = {};
  if (src.business && typeof src.business === 'object') {
    const desc = wrap(src.business.description);
    if (desc !== undefined) out.business = { description: desc };
  }
  if (src.services && typeof src.services === 'object') {
    const list = wrap(src.services.list);
    if (list !== undefined) out.services = { list };
  }
  const areas = wrap(src.service_areas);
  if (areas !== undefined) out.service_areas = areas;
  if (src.brand && typeof src.brand === 'object') {
    const tone = wrap(src.brand.tone);
    if (tone !== undefined) out.brand = { tone };
  }
  const testi = wrap(src.testimonials);
  if (testi !== undefined) out.testimonials = testi;
  return out;
}

function tryParseAssistant(content = '') {
  const stripped = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

async function inferTradecard(tradecard = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { _meta: { skipped: 'no_api_key' } };

  const summary = {
    name: tradecard?.business?.name,
    headings: (tradecard?.content?.headings || [])
      .map((h) => h.text)
      .slice(0, 25),
    contacts: {
      emails: tradecard?.contacts?.emails || [],
      phones: tradecard?.contacts?.phones || []
    },
    images: (tradecard?.assets?.images || []).slice(0, 3)
  };

  const website = tradecard?.contacts?.website;
  let domain;
  try {
    domain = new URL(website).hostname.replace(/^www\./, '');
  } catch {}

  const userPayload = {
    context: {
      business_name: domain || tradecard?.business?.name,
      contacts: { website }
    },
    summary
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
          {
            role: 'system',
            content:
              'Output ONLY JSON where each field is {"value":...,"confidence":0-1}. Schema: {"business":{"description":{}},"services":{"list":{}},"service_areas":{},"brand":{"tone":{}},"testimonials":{}}. Omit unknowns.'
          },
          { role: 'user', content: JSON.stringify(userPayload) }
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
  const parsed = tryParseAssistant(content);
  if (!parsed) return { _meta: { error: 'invalid_json' } };
  return { ...pickAllowed(parsed), _meta: { ok: true } };
}

module.exports = { inferTradecard, tryParseAssistant };
