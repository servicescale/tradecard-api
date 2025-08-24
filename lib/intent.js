const { getAllowKeys } = require('./acf_contract');
const { resolveMVF } = require('./mvf_resolver');

async function applyIntent(tradecard, { raw, resolve = 'llm' } = {}) {
  const allow = getAllowKeys();
  const fields = {};
  const sent = new Set();
  const trace = [];
  const audit = [];

  const put = (k, v) => {
    if (!allow.has(k)) return;
    const s = (v == null ? '' : String(v)).trim();
    if (!s) return;
    fields[k] = s;
    sent.add(k);
  };

  // 1) Deterministic MVF baseline first
  const mvf = resolveMVF({ raw: raw || {}, tradecard: tradecard || {}, allowKeys: allow });
  for (const [k, v] of Object.entries(mvf.fields || {})) put(k, v);
  audit.push(...(mvf.audit || []));
  trace.push({
    stage: 'det_resolve',
    sent: Object.keys(mvf.fields || {}).length,
    sample_sent: Object.keys(mvf.fields || {}).slice(0, 10)
  });

  // 2) Optional LLM top-up ONLY if still below MIN
  const min = Number(process.env.MIN_ACF_KEYS) || 10;
  if (resolve === 'llm' && sent.size < min) {
    const { resolveWithLLM } = require('./llm_resolver');
    const llm = await resolveWithLLM({ raw: raw || {}, allowKeys: allow, hints: mvf.fields || {} });
    for (const [k, v] of Object.entries(llm.fields || {})) put(k, v);
    audit.push(...(llm.audit || []));
    trace.push({
      stage: 'llm_resolve',
      sent: Object.keys(llm.fields || {}).length,
      sample_sent: Object.keys(llm.fields || {}).slice(0, 10)
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
