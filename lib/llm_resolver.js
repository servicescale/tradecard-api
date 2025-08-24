"use strict";
async function callOpenAI(messages){
  const apiKey = process.env.OPENAI_API_KEY;
  if(!apiKey) return "";
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
      body:JSON.stringify({model:'gpt-4o-mini',temperature:0,messages})
    });
    const data=await res.json().catch(()=>({}));
    return data?.choices?.[0]?.message?.content||"";
  } catch { return ""; }
}
function buildUserPayloadForField(key, rule, raw, tradecard){
  const links=(raw.anchors||[]).slice(0,50);
  const headings=(raw.headings||[]).slice(0,25).map(h=>h.text||h);
  const images=(raw.images||[]).slice(0,30);
  return { key, instructions:(rule.llm?.prompt||""), headings, links, images, tradecard_hint:{
    name:tradecard?.business?.name||"", website:tradecard?.contacts?.website||""
  }};
}
module.exports.resolveField = async function resolveField(key, rule, {raw, tradecard}){
  const system = "Return ONLY the value as plain text. No extra words.";
  const user = buildUserPayloadForField(key, rule, raw, tradecard);
  const text = await callOpenAI([{role:"system",content:system},{role:"user",content:JSON.stringify(user)}]);
  const s = (text||"").trim();
  // optional simple validations
  if (rule?.llm?.validate?.regex) {
    const rx = new RegExp(rule.llm.validate.regex.replace(/^\/|\/$/g,""));
    if (!rx.test(s)) return "";
  }
  if (rule?.llm?.validate?.min_len && s.length < rule.llm.validate.min_len) return "";
  if (rule?.llm?.validate?.max_len && s.length > rule.llm.validate.max_len) return s.slice(0, rule.llm.validate.max_len);
  return s;
};
module.exports.resolveMissing = async function resolveMissing(missingKeys, {raw, tradecard}){
  const system = "You output ONLY valid JSON. Keys MUST be from the requested set. Values MUST be trimmed strings. Omit empty.";
  const links=(raw.anchors||[]).slice(0,50), headings=(raw.headings||[]).slice(0,25).map(h=>h.text||h), images=(raw.images||[]).slice(0,30);
  const user = { missingKeys, headings, links, images, tradecard_hint:{name:tradecard?.business?.name||"", website:tradecard?.contacts?.website||""} };
  const jsonText = await callOpenAI([{role:"system",content:system},{role:"user",content:JSON.stringify(user)}]);
  let json; try{ json=JSON.parse(jsonText); } catch{ json={}; }
  const out={}; for (const k of missingKeys){ const v=json?.[k]; if (v!=null) out[k]=String(v).trim(); }
  return out;
};
function pruneRaw(raw = {}) {
  const out = {};
  if (Array.isArray(raw.headings) && raw.headings.length) {
    out.headings = raw.headings.slice(0, 20).map((h) => h.text || h);
  }
  if (Array.isArray(raw.anchors) && raw.anchors.length) {
    out.links = raw.anchors.slice(0, 50).map((a) => ({
      href: a.href || '',
      text: a.text || ''
    }));
  }
  if (Array.isArray(raw.images) && raw.images.length) {
    out.images = raw.images.slice(0, 30).map((img) => ({
      src: img.src || img,
      alt: img.alt || ''
    }));
  }
  if (raw.meta && typeof raw.meta.description === 'string') {
    out.meta = { description: raw.meta.description };
  }
  if (Array.isArray(raw.jsonld) && raw.jsonld.length) {
    out.jsonld = raw.jsonld.slice(0, 5).map((j) => {
      try {
        return JSON.stringify(j).slice(0, 1000);
      } catch {
        return String(j);
      }
    });
  }
  if (Array.isArray(raw.text_blocks) && raw.text_blocks.length) {
    out.text_blocks = raw.text_blocks
      .slice(0, 50)
      .map((t) => String(t).slice(0, 200));
  }
  if (Array.isArray(raw.profile_videos) && raw.profile_videos.length) {
    out.profile_videos = raw.profile_videos
      .slice(0, 5)
      .map((v) => String(v).slice(0, 200));
  }
  if (Array.isArray(raw.contact_form_links) && raw.contact_form_links.length) {
    out.contact_form_links = raw.contact_form_links
      .slice(0, 5)
      .map((v) => String(v).slice(0, 200));
  }
  if (Array.isArray(raw.awards) && raw.awards.length) {
    out.awards = raw.awards.slice(0, 10).map((a) => ({
      text: String(a.text || '').slice(0, 200),
      href: String(a.href || '').slice(0, 200)
    }));
  }
  if (Array.isArray(raw.social) && raw.social.length) {
    out.social = raw.social.slice(0, 10).map((s) => ({
      platform: s.platform || '',
      url: s.url || ''
    }));
  }
  if (raw.contacts && typeof raw.contacts === 'object') {
    const { emails, phones } = raw.contacts;
    const contacts = {};
    if (Array.isArray(emails) && emails.length) {
      contacts.emails = emails.slice(0, 10).map((e) => String(e).slice(0, 200));
    }
    if (Array.isArray(phones) && phones.length) {
      contacts.phones = phones.slice(0, 10).map((p) => String(p).slice(0, 100));
    }
    if (Object.keys(contacts).length) out.contacts = contacts;
  }
  return out;
}

module.exports.resolveWithLLM = async function resolveWithLLM({ raw = {}, allowKeys = new Set(), hints = {}, context = {} } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !(allowKeys instanceof Set) || allowKeys.size === 0) {
    return { fields: {}, audit: [] };
  }
  const user = {
    allowKeys: Array.from(allowKeys),
    hints,
    context,
    raw_pruned: pruneRaw(raw),
    targets: Array.from(allowKeys).filter((k) => !hints[k])
  };
  const messages = [
    { role: 'system', content: 'Return ONLY valid JSON. Keys MUST be from allowKeys. Values MUST be strings (trimmed). Omit empty. No explanation.' },
    { role: 'user', content: JSON.stringify(user) }
  ];
  const text = await callOpenAI(messages);
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = {}; }
  const fields = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (!allowKeys.has(k)) continue;
    const s = String(v ?? '').trim();
    if (!s) continue;
    fields[k] = s;
  }
  const audit = Object.keys(fields).map((k) => ({ key: k, source: 'llm' }));
  return { fields, audit };
};
