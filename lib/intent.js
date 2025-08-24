const { getAllowKeys } = require('./acf_contract');
const rule = require('./rule_exec');
const llm = require('./llm_resolver');
let buildCompleteness; try{ ({ buildCompleteness } = require('./completeness')); }catch{}

exports.applyIntent = async function applyIntent(tradecard, { raw, resolve='map' } = {}) {
  const allow = getAllowKeys();
  const { resolveMVF } = require('./mvf_resolver');
  const mvf = await resolveMVF({ raw: raw || {}, tradecard: tradecard || {}, allowKeys: allow });
  const helpers = {
    detSeed: () => mvf.fields || {},
    detResolve: (key, rule, ctx) => "",
    derive: (key, rule, {fields}) => {
      if (key==="identity_services") {
        const titles=[fields.service_1_title, fields.service_2_title, fields.service_3_title].filter(Boolean);
        return titles.length ? titles.join(", ") : "";
      }
      return "";
    }
  };
  const llmRunner = resolve==='map'? llm : null;
  const { fields, audit } = await rule.runRules({ tradecard, raw, allowKeys: allow, llm: llmRunner, helpers });
  const trace=[ {stage:"rule_apply", audit}, {stage:"intent_coverage", after:Object.keys(fields).length, sample_sent:Object.keys(fields).slice(0,10)} ];
  try { if (buildCompleteness) trace.push({stage:"completeness", report: buildCompleteness(fields)}); } catch {}
  return { fields, sent_keys:Object.keys(fields), audit, trace };
};
