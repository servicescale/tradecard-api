const { getAllowKeys, aliases } = require('./acf_contract');
const { extractHints } = require('./hints');
const { resolveWithLLM } = require('./llm_resolver');

async function applyIntent(tradecard, { raw, resolve = 'llm' } = {}) {
  const allow = getAllowKeys();
  const fields = {};
  const sent = new Set();
  const trace = [];
  const audit = [];

  function put(k, v) {
    const key = allow.has(k) ? k : aliases[k];
    if (!key || !allow.has(key)) return;
    const s = (v == null ? '' : String(v)).trim();
    if (!s) return;
    fields[key] = s;
    sent.add(key);
  }

  const hints = extractHints(raw || {});

  put('identity_business_name', hints.name || tradecard?.business?.name);
  put('identity_website_url', hints.website || tradecard?.contacts?.website);
  put('identity_email', hints.emails?.[0]);
  put('identity_phone', hints.phones?.[0]);
  put('identity_logo_url', hints.logo_url);
  for (const [k, v] of Object.entries(hints.socials || {})) {
    put(`social_links_${k}`, v);
  }

  trace.push({
    stage: 'hint_extract',
    emails: hints.emails?.length || 0,
    phones: hints.phones?.length || 0,
    socials: Object.values(hints.socials || {}).filter(Boolean).length,
    logo: !!hints.logo_url,
    services: (hints.service_titles || []).length
  });

  if (resolve === 'llm') {
    const { fields: llm, audit: la } = await resolveWithLLM({
      raw,
      allowKeys: allow,
      hints
    });
    for (const [k, v] of Object.entries(llm || {})) put(k, v);
    audit.push(...la);
    trace.push({
      stage: 'llm_resolve',
      sent: Object.keys(llm || {}).length,
      sample_sent: Object.keys(llm || {}).slice(0, 10)
    });
  }

  trace.push({
    stage: 'intent_coverage',
    after: sent.size,
    sample_sent: Array.from(sent).slice(0, 10)
  });

  return { fields, sent_keys: Array.from(sent), audit, trace };
}

module.exports = { applyIntent };
