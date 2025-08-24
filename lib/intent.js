const { acfContract } = require('./acf_contract');
const { resolveWithLLM } = require('./llm_resolver');

async function applyIntent(tradecard, { raw, resolve = 'llm' } = {}) {
  const allowKeys = acfContract;
  const { fields, audit } = await resolveWithLLM({ raw, allowKeys });
  const sent = Object.keys(fields);
  return {
    fields,
    sent_keys: sent,
    audit,
    trace: [
      {
        stage: 'llm_resolve',
        sent: sent.length,
        sample_sent: sent.slice(0, 10)
      }
    ]
  };
}

module.exports = { applyIntent };
