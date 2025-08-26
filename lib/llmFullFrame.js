"use strict";

async function callLLM(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "{}";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Extract data and return only valid JSON." },
          { role: "user", content: JSON.stringify(payload) }
        ]
      })
    });
    const data = await res.json().catch(() => ({}));
    return data?.choices?.[0]?.message?.content || "{}";
  } catch {
    return "{}";
  }
}

function compactRaw(raw = {}) {
  const anchors = Array.isArray(raw.anchors) ? raw.anchors : [];
  const headings = Array.isArray(raw.headings) ? raw.headings : [];
  const images = Array.isArray(raw.images) ? raw.images : [];
  const jsonld = Array.isArray(raw.jsonld) ? raw.jsonld : [];
  const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  return {
    anchors: anchors.slice(0, 50),
    headings: headings.slice(0, 50),
    images: images.slice(0, 50),
    jsonld: jsonld.slice(0, 20),
    meta: Object.fromEntries(Object.entries(meta).slice(0, 20)),
    counts: {
      anchors: anchors.length,
      headings: headings.length,
      images: images.length,
      jsonld: jsonld.length,
      meta: Object.keys(meta).length
    }
  };
}

async function proposeForUnresolved({ raw = {}, allowKeys = [], unresolvedKeys = [], intentMap = {}, resolveConfig = {}, fixture = "", fullRaw = false }) {
  const keys = unresolvedKeys.filter((k) => allowKeys.includes(k));
  const fieldIntent = {};
  for (const k of keys) if (intentMap[k]) fieldIntent[k] = intentMap[k];
  const resolveCfg = {};
  for (const k of keys) if (resolveConfig[k]) resolveCfg[k] = resolveConfig[k];
  const safeRaw = fullRaw ? raw : compactRaw(raw);
  const prompt = {
    fixture,
    ALLOW_KEYS: allowKeys,
    UNRESOLVED_KEYS: keys,
    RAW: safeRaw,
    FIELD_INTENT: fieldIntent,
    RESOLVE_CONFIG: resolveCfg,
    INSTRUCTION: "Return strict JSON {key:string} for keys ∈ unresolvedKeys∩allowKeys only. Prefer exact strings from RAW; synthesize only when absent; validate email/phone/url/len; '' if unknown."
  };
  const promptStr = JSON.stringify(prompt);
  const approx_bytes = Buffer.byteLength(promptStr);
  const approx_tokens = Math.ceil(approx_bytes / 4);
  const rawRes = await callLLM(prompt);
  let obj;
  try { obj = JSON.parse(rawRes); } catch { obj = {}; }
  const proposals = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      proposals[k] = obj[k] === null || obj[k] === undefined ? "" : String(obj[k]);
    }
  }
  return { proposals, stats: { approx_tokens, approx_bytes } };
}

module.exports = { proposeForUnresolved };

