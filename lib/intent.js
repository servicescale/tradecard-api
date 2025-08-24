const { getAllowKeys } = require('./acf_contract');
const { resolveMVF } = require('./mvf_resolver');
const { deriveFields } = require('./resolve');

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
  const mvf = await resolveMVF({ raw: raw || {}, tradecard: tradecard || {}, allowKeys: allow });
  for (const [k, v] of Object.entries(mvf.fields || {})) put(k, v);
  audit.push(...(mvf.audit || []));
  trace.push({
    stage: 'det_resolve',
    sent: Object.keys(mvf.fields || {}).length,
    sample_sent: Object.keys(mvf.fields || {}).slice(0, 10)
  });

  // 2) Optional LLM top-up for any remaining keys
  const remaining = new Set(Array.from(allow).filter((k) => !fields[k]));
  const min = Number(process.env.MIN_ACF_KEYS) || allow.size;
  if (resolve === 'llm' && remaining.size && sent.size < min) {
    const { resolveWithLLM } = require('./llm_resolver');
    const context = {
      business_name: tradecard?.business?.name,
      contacts: tradecard?.contacts,
      social: tradecard?.social,
      services: tradecard?.services?.list,
      service_areas: tradecard?.service_areas
    };
    const llm = await resolveWithLLM({ raw: raw || {}, allowKeys: remaining, hints: fields, context });
    for (const [k, v] of Object.entries(llm.fields || {})) put(k, v);
    audit.push(...(llm.audit || []));
    trace.push({
      stage: 'llm_resolve',
      sent: Object.keys(llm.fields || {}).length,
      sample_sent: Object.keys(llm.fields || {}).slice(0, 10)
    });
  }

  deriveFields(fields, { tradecard_url: tradecard?.tradecard_url || tradecard?.url });
  for (const k of Object.keys(fields)) sent.add(k);

  const unresolved = Array.from(allow).filter((k) => !fields[k]);

  trace.push({
    stage: 'intent_coverage',
    after: sent.size,
    sample_sent: Array.from(sent).slice(0, 10)
  });

  trace.push({ stage: 'unresolved', remaining: unresolved });

  return { fields, sent_keys: Array.from(sent), audit, trace };
}

module.exports = { applyIntent };
