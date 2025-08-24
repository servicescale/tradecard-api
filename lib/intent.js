const { getAllowKeys } = require('./acf_contract');
const { extractHints } = require('./hints');
const { resolveWithLLM } = require('./llm_resolver');

async function applyIntent(tradecard, { raw, resolve = 'llm' } = {}) {
  const allow = getAllowKeys();
  const fields = {};
  const sent = new Set();
  const trace = [];
  const audit = [];
  const hints = extractHints(raw || {});

  const put = (k, v) => {
    if (!allow.has(k)) return;
    if (v === null || v === undefined) return;
    const s = String(v).trim();
    if (!s) return;
    fields[k] = s;
    sent.add(k);
  };

  put('identity_business_name', hints.name ?? tradecard?.business?.name);
  put('identity_website_url', hints.website ?? tradecard?.contacts?.website);
  put('identity_email', hints.emails?.[0]);
  put('identity_phone', hints.phones?.[0]);
  put('identity_logo_url', hints.logo_url);
  for (const social of ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiktok', 'pinterest']) {
    put(`social_links_${social}`, hints.socials?.[social]);
  }

  if (resolve === 'llm') {
    const { fields: llm, audit: la } = await resolveWithLLM({ raw, allowKeys: allow, hints });
    for (const [k, v] of Object.entries(llm)) {
      if (!allow.has(k)) continue;
      const s = String(v).trim();
      if (!s) continue;
      fields[k] = s;
      sent.add(k);
    }
    audit.push(...la);
    trace.push({ stage: 'llm_resolve', sent: Object.keys(llm).length, sample_sent: Object.keys(llm).slice(0, 10) });
  }

  trace.push({ stage: 'intent_coverage', after: sent.size, sample_sent: Array.from(sent).slice(0, 10) });

  return { fields, sent_keys: Array.from(sent), audit, trace };
}

module.exports = { applyIntent };

