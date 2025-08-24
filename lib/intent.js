const { getAllowKeys } = require('./acf_contract');
const { extractHints } = require('./hints');
const { resolveWithLLM } = require('./llm_resolver');

async function applyIntent(tradecard, { raw, resolve = 'llm' } = {}) {
  const allow = getAllowKeys();
  const fields = {};
  const audit = [];
  const trace = [];

  const put = (k, v) => {
    if (!allow.has(k)) return;
    const s = String(v ?? '').trim();
    if (!s) return;
    fields[k] = s;
  };

  if (resolve === 'llm') {
    const hints = extractHints(raw || {});
    trace.push({
      stage: 'hint_extract',
      emails: hints.emails.length,
      phones: hints.phones.length,
      socials: Object.values(hints.socials || {}).filter(Boolean).length,
      logo: !!hints.logo_url
    });

    const { fields: llmFields, audit: la } = await resolveWithLLM({
      raw,
      allowKeys: allow,
      hints
    });
    trace.push({
      stage: 'llm_resolve',
      sent: Object.keys(llmFields).length,
      sample_sent: Object.keys(llmFields).slice(0, 10)
    });
    for (const [k, v] of Object.entries(llmFields)) put(k, v);
    trace.push({
      stage: 'intent_coverage',
      after: Object.keys(fields).length,
      sample_sent: Object.keys(fields).slice(0, 10)
    });
    audit.push(...la);
  }

  return { fields, sent_keys: Object.keys(fields), audit, trace };
}

module.exports = { applyIntent };

