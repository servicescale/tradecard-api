// lib/infer.js
// Calls OpenAI to infer additional TradeCard fields from scraped data.
// Node 18+: use global fetch

async function inferTradecard(tradecard) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required');

  const summary = {
    name: tradecard?.business?.name,
    headings: (tradecard?.content?.headings || []).slice(0, 25),
    contacts: tradecard?.contacts,
    images: (tradecard?.assets?.images || []).slice(0, 5),
  };

  const systemPrompt = 'You are a helpful assistant that extracts structured business information.';
  const userPrompt = `Given the following scraped data, provide a JSON object with optional keys \n` +
    `business.description (string), services.list (array of strings), service_areas (array of strings),\n` +
    `brand.tone (string), testimonials (array). Only include keys with non-null values.\n\n` +
    `${JSON.stringify(summary)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  });

  const json = await res.json().catch(() => ({}));
  let content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!content) return {};
  try { return JSON.parse(content); } catch { return {}; }
}

module.exports = { inferTradecard };
