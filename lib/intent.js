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
    const { fields: llm, audit: la } = await resolveWithLLM({ raw, allowKeys: allow, hints });
    for (const [k, v] of Object.entries(llm)) put(k, v);
    audit.push(...la);
  }

  return { fields, sent_keys: Object.keys(fields), audit, trace };
}

module.exports = { applyIntent };

