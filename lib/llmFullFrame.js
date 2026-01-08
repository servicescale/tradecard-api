"use strict";

const { Logger } = require("./logger");

/**
 * LLM interaction helpers with self-verification.
 *
 * `proposeForUnresolved` performs a two-pass strategy where the first
 * prompt proposes answers for requested fields and a second prompt verifies
 * those answers.  It returns the verified results along with any keys where
 * the verification disagreed with the initial proposal so callers can handle
 * mismatches explicitly.
 */

async function callLLM(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "{}";
  try {
    const requestBody = {
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Extract data and return only valid JSON." },
        { role: "user", content: JSON.stringify(payload) }
      ]
    };
    Logger.debug("LLM", "OpenAI request", { endpoint: "chat_completions", body: requestBody });
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    const data = await res.json().catch(() => ({}));
    Logger.debug("LLM", "OpenAI response", { endpoint: "chat_completions", status: res.status, ok: res.ok, data });
    return data?.choices?.[0]?.message?.content || "{}";
  } catch (err) {
    Logger.debug("LLM", "OpenAI request failed", { endpoint: "chat_completions", error: err.message || String(err) });
    return "{}";
  }
}

function compactRaw(raw = {}) {
  const anchors = Array.isArray(raw.anchors) ? raw.anchors : [];
  const headings = Array.isArray(raw.headings) ? raw.headings : [];
  const images = Array.isArray(raw.images) ? raw.images : [];
  const jsonld = Array.isArray(raw.jsonld) ? raw.jsonld : [];
  const textBlocks = Array.isArray(raw.text_blocks) ? raw.text_blocks : [];
  const testimonials = Array.isArray(raw.testimonials) ? raw.testimonials : [];
  const awards = Array.isArray(raw.awards) ? raw.awards : [];
  const profileVideos = Array.isArray(raw.profile_videos) ? raw.profile_videos : [];
  const social = Array.isArray(raw.social) ? raw.social : [];
  const servicePanels = Array.isArray(raw.service_panels) ? raw.service_panels : [];
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  return {
    anchors: anchors.slice(0, 50),
    headings: headings.slice(0, 50),
    images: images.slice(0, 50),
    text_blocks: textBlocks.slice(0, 60).map((t) => String(t).slice(0, 200)),
    testimonials: testimonials.slice(0, 15),
    awards: awards.slice(0, 15),
    profile_videos: profileVideos.slice(0, 10),
    social: social.slice(0, 20),
    service_panels: servicePanels.slice(0, 10),
    projects: projects.slice(0, 10),
    jsonld: jsonld.slice(0, 20),
    meta: Object.fromEntries(Object.entries(meta).slice(0, 20)),
    counts: {
      anchors: anchors.length,
      headings: headings.length,
      images: images.length,
      text_blocks: textBlocks.length,
      testimonials: testimonials.length,
      awards: awards.length,
      profile_videos: profileVideos.length,
      social: social.length,
      service_panels: servicePanels.length,
      projects: projects.length,
      jsonld: jsonld.length,
      meta: Object.keys(meta).length
    }
  };
}

async function proposeForUnresolved({
  raw = {},
  allowKeys = [],
  unresolvedKeys = [],
  intentMap = {},
  resolveConfig = {},
  fixture = "",
  fullRaw = true,
  maxTokens = 6e4
}) {
  const keys = Array.from(new Set([...allowKeys, ...unresolvedKeys]));
  const fieldIntent = {};
  for (const k of keys) if (intentMap[k]) fieldIntent[k] = intentMap[k];
  const resolveCfg = {};
  for (const k of keys) if (resolveConfig[k]) resolveCfg[k] = resolveConfig[k];
  let safeRaw = fullRaw ? raw : compactRaw(raw);
  let prompt = {
    fixture,
    ALLOW_KEYS: allowKeys,
    REQUEST_KEYS: keys,
    RAW: safeRaw,
    FIELD_INTENT: fieldIntent,
    RESOLVE_CONFIG: resolveCfg,
    INSTRUCTION: "Return strict JSON {key:string} for keys ⊆ REQUEST_KEYS only. Prefer exact strings from RAW; synthesize only when absent; validate email/phone/url/len; '' if unknown.",
  };
  let promptStr = JSON.stringify(prompt);
  let approx_bytes = Buffer.byteLength(promptStr);
  let approx_tokens = Math.ceil(approx_bytes / 4);
  if (approx_tokens > maxTokens && fullRaw) {
    safeRaw = compactRaw(raw);
    prompt.RAW = safeRaw;
    promptStr = JSON.stringify(prompt);
    approx_bytes = Buffer.byteLength(promptStr);
    approx_tokens = Math.ceil(approx_bytes / 4);
  }
  const rawRes = await callLLM(prompt);
  let obj;
  try { obj = JSON.parse(rawRes); } catch { obj = {}; }
  const proposals = {};
  const allowSet = new Set(allowKeys);
  for (const [k, v] of Object.entries(obj)) {
    if (!allowSet.size || allowSet.has(k)) {
      proposals[k] = v === null || v === undefined ? "" : String(v);
    }
  }

  // Second pass: verification prompt compares original proposals with RAW.
  const verifyPrompt = {
    fixture,
    RAW: safeRaw,
    ORIGINAL: proposals,
    INSTRUCTION: "Verify each ORIGINAL value against RAW and return corrected JSON for the same keys. Use ORIGINAL value if already correct."
  };
  const verifyRes = await callLLM(verifyPrompt);
  let verifiedObj;
  try { verifiedObj = JSON.parse(verifyRes); } catch { verifiedObj = {}; }
  const verified = {};
  const discrepancies = [];
  for (const k of Object.keys(proposals)) {
    let v = verifiedObj[k];
    if (v === undefined) v = proposals[k];
    const str = v === null || v === undefined ? "" : String(v);
    verified[k] = str;
    if (str !== proposals[k]) discrepancies.push(k);
  }

  return {
    proposals: verified,
    discrepancies,
    stats: { approx_tokens, approx_bytes }
  };
}

module.exports = { proposeForUnresolved };
