"use strict";
const fs=require("fs"), path=require("path"), YAML=require("yaml");
function readY(p){ try{ return YAML.parse(fs.readFileSync(path.resolve(p),"utf8")); } catch { return {}; } }
function loadMap(){ return readY("config/field_intent_map.yaml") || {}; }
function expandKeys(map){
  const idx=map.service_index||[1,2,3];
  const keys=Object.keys(map).filter(k=>k!=="service_index");
  const out=[];
  for (const k of keys){
    if (k.includes("{i}")) idx.forEach(i => out.push(k.replace("{i}", String(i))));
    else out.push(k);
  }
  return out;
}
function catOf(k){
  if(k.startsWith("identity_")) return "identity";
  if(k.startsWith("social_links_")) return "socials";
  if(k.startsWith("service_")) return "services";
  if(k==="business_description"||k==="service_areas_csv") return "content";
  if(k.startsWith("testimonial_")) return "testimonials";
  if(k.startsWith("trust_")||k.startsWith("theme_")) return "trust_theme";
  return "other";
}
module.exports.loadIntentMap = loadMap;
module.exports.expandIntentKeys = expandKeys;
module.exports.categoryOf = catOf;

function createPut(allowKeys, fields){
  return (k, v)=>{
    if(!allowKeys.has(k)) return false;
    const s=(v==null?"":String(v)).trim();
    if(!s) return false;
    fields[k]=s;
    return true;
  };
}

function recordAudit(audit, {key, strategy, ok, reason}){
  const entry={key, strategy, ok};
  if (reason) entry.reason = reason;
  audit.push(entry);
}

function getRequiredIdentityKeys(map, allowKeys){
  return Object.entries(map)
    .filter(([k,v]) => v.priority === "required" && k.startsWith("identity_") && allowKeys.has(k))
    .map(([k]) => k);
}

async function resolveField({key, rule, context, fields, helpers, llm, put, audit}){
  const strat=rule.strategy || "llm";
  const resolveDet = ()=> helpers?.detResolve ? helpers.detResolve(key, rule, context) : "";
  const resolveDerive = ()=> helpers?.derive ? helpers.derive(key, rule, {fields, ...context}) : "";

  if (strat==="det" || strat==="det_then_llm"){
    const v = resolveDet();
    if (put(key,v)) { recordAudit(audit, {key, strategy:"det", ok:true}); return; }
    if (strat==="det") { recordAudit(audit, {key, strategy:"det", ok:false, reason:"empty"}); return; }
  }

  if (strat==="llm" || strat==="det_then_llm"){
    if (!llm) { recordAudit(audit, {key, strategy:"llm", ok:false, reason:"no_llm_runner"}); return; }
    const v = await llm.resolveField(key, rule, context);
    if (put(key,v)) { recordAudit(audit, {key, strategy:"llm", ok:true}); return; }
    recordAudit(audit, {key, strategy:"llm", ok:false, reason:"empty_or_invalid"});
    return;
  }

  if (strat==="derive"){
    const v = resolveDerive();
    if (put(key,v)) recordAudit(audit, {key, strategy:"derive", ok:true});
    else recordAudit(audit, {key, strategy:"derive", ok:false});
  }
}

module.exports.runRules = async function runRules({tradecard={}, raw={}, allowKeys, llm, helpers}) {
  const fmap=loadMap(), keys=expandKeys(fmap);
  const fields={}, audit=[];
  const put = createPut(allowKeys, fields);
  const context = {raw, tradecard};

  // 1) deterministic helpers (optional pre-seed)
  if (helpers?.detSeed) {
    for (const [k,v] of Object.entries(helpers.detSeed(context)||{})) {
      if (put(k,v)) recordAudit(audit, {key:k,strategy:"det",ok:true});
    }
  }

  // 2) per-field execution
  for (const key of keys){
    if (fields[key]) continue;
    const rule=fmap[key] || {};
    await resolveField({key, rule, context, fields, helpers, llm, put, audit});
  }

  // 3) rescue for missing required fields based on priority
  const required = getRequiredIdentityKeys(fmap, allowKeys);
  const missingReq = required.filter(k => !fields[k]);
  if (missingReq.length && llm?.resolveMissing) {
    const rescue = await llm.resolveMissing(missingReq, context);
    for (const [k,v] of Object.entries(rescue||{})) {
      if (put(k,v)) recordAudit(audit, {key:k, strategy:"rescue", ok:true});
    }
  }

  return { fields, audit };
};
