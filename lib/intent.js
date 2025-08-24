const { getAllowKeys } = require('./acf_contract');
const { extractHints } = require('./hints');
const { resolveWithLLM } = require('./llm_resolver');

async function applyIntent(tradecard, { raw, resolve = 'llm' } = {}) {
  const allowKeys = await getAllowKeys();
  const hints = extractHints(raw || {});

  const deterministic = {};
  const put = (k, v) => {
    if (!allowKeys.includes(k)) return;
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (!s) return;
    deterministic[k] = s;
  };

  put('identity_business_name', hints.name || tradecard?.business?.name);
  put('identity_website_url', hints.website || tradecard?.contacts?.website);
  put('identity_email', hints.emails?.[0]);
  put('identity_phone', hints.phones?.[0]);
  put('identity_logo_url', hints.logo_url);
  for (const [p, url] of Object.entries(hints.socials || {})) {
    put(`social_links_${p}`, url);
  }

  let llm = {}, la = [];
  if (resolve === 'llm') {
    const r = await resolveWithLLM({ raw, allowKeys, hints });
    llm = r.fields || {};
    la = r.audit || [];
  }

  const fields = {};
  const merge = (obj = {}) => {
    for (const [k, v] of Object.entries(obj)) {
      if (!allowKeys.includes(k)) continue;
      if (v === undefined || v === null) continue;
      const s = String(v).trim();
      if (!s) continue;
      fields[k] = s;
    }
  };
  merge(deterministic);
  merge(llm);

  const sent_keys = Object.keys(fields);

  const trace = [];
  trace.push({
    stage: 'hint_extract',
    emails: hints.emails.length,
    phones: hints.phones.length,
    socials: Object.values(hints.socials || {}).filter(Boolean).length,
    logo: !!hints.logo_url
  });
  trace.push({
    stage: 'llm_resolve',
    sent: Object.keys(llm).length,
    sample_sent: Object.keys(llm).slice(0, 10)
  });
  trace.push({
    stage: 'intent_coverage',
    after: sent_keys.length,
    sample_sent: sent_keys.slice(0, 10)
  });

  return { fields, sent_keys, audit: [...la], trace };
}

module.exports = { applyIntent };

