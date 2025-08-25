const { getAllowKeys } = require('./acf_contract');
const { resolveMVF } = require('./mvf_resolver');
const { resolveWithLLM } = require('./llm_resolver');
const { deriveFields } = require('./resolve');
let buildCompleteness; try { ({ buildCompleteness } = require('./completeness')); } catch {}

exports.applyIntent = async function applyIntent(tradecard = {}, { raw = {}, resolve = 'llm' } = {}) {
  const allow = getAllowKeys();
  const mvf = await resolveMVF({ raw, tradecard, allowKeys: allow });
  const fields = { ...(mvf.fields || {}) };
  const audit = Object.keys(fields).map((k) => ({ key: k, strategy: 'det', ok: true }));
  const trace = [];
  if (audit.length) trace.push({ stage: 'det_resolve', count: audit.length });

  if (resolve !== 'none') {
    let domain;
    try { domain = new URL(tradecard?.contacts?.website || '').hostname.replace(/^www\./, ''); } catch {}
    const context = { business_name: domain || tradecard?.business?.name || '', contacts: { website: tradecard?.contacts?.website || '' } };
    const { fields: llmFields } = await resolveWithLLM({ raw, allowKeys: allow, hints: fields, context });
    const llmKeys = Object.keys(llmFields);
    for (const [k, v] of Object.entries(llmFields)) {
      if (!v) continue;
      fields[k] = v;
      audit.push({ key: k, strategy: 'llm', ok: true });
    }
    if (llmKeys.length) trace.push({ stage: 'llm_resolve', count: llmKeys.length });
  }

  trace.push({ stage: 'rule_apply', audit });

  deriveFields(fields, tradecard);
  trace.push({ stage: 'intent_coverage', after: Object.keys(fields).length, sample_sent: Object.keys(fields).slice(0, 10) });
  try { if (buildCompleteness) trace.push({ stage: 'completeness', report: buildCompleteness(fields) }); } catch {}
  return { fields, sent_keys: Object.keys(fields), audit, trace };
};
