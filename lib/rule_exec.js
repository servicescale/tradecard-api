"use strict";
const fs=require("fs"), path=require("path"), YAML=require("yaml");
function readY(p){ try{ return YAML.parse(fs.readFileSync(path.resolve(p),"utf8")); } catch { return {}; } }
function loadMap(){ return readY("config/field_intent_map.yaml") || {}; }
function expandKeys(map){
  const idx=map.service_index||[1,2,3];
  const keys=Object.keys(map).filter(k=>k!=="policy" && k!=="service_index");
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

module.exports.runRules = async function runRules({tradecard={}, raw={}, allowKeys, llm, helpers}) {
  const fmap=loadMap(), keys=expandKeys(fmap);
  const fields={}, audit=[];
  const put = (k,v)=>{ if(!allowKeys.has(k)) return false;
    const s=(v==null?"":String(v)).trim(); if(!s) return false; fields[k]=s; return true; };

  // 1) deterministic helpers (optional pre-seed)
  if (helpers?.detSeed) {
    for (const [k,v] of Object.entries(helpers.detSeed({raw,tradecard})||{})) {
      if (put(k,v)) audit.push({key:k,strategy:"det",ok:true});
    }
  }

  // 2) per-field execution
  for (const key of keys){
    if (fields[key]) continue;
    const rule=fmap[key] || {};
    const strat=rule.strategy || "llm";

    // det
    if (strat==="det" || strat==="det_then_llm"){
      const v = helpers?.detResolve ? helpers.detResolve(key, rule, {raw, tradecard}) : "";
      if (put(key,v)) { audit.push({key, strategy:"det", ok:true}); continue; }
      if (strat==="det") { audit.push({key,strategy:"det", ok:false, reason:"empty"}); continue; }
    }

    // llm
    if (strat==="llm" || strat==="det_then_llm"){
      if (!llm) { audit.push({key,strategy:"llm", ok:false, reason:"no_llm_runner"}); continue; }
      const v = await llm.resolveField(key, rule, {raw, tradecard});
      if (put(key,v)) { audit.push({key, strategy:"llm", ok:true}); continue; }
      audit.push({key, strategy:"llm", ok:false, reason:"empty_or_invalid"});
    }

    // derive
    if (strat==="derive"){
      const v = helpers?.derive ? helpers.derive(key, rule, {fields, raw, tradecard}) : "";
      if (put(key,v)) audit.push({key, strategy:"derive", ok:true});
      else audit.push({key, strategy:"derive", ok:false});
    }
  }

  // 3) rescue for missing required (map.policy.required)
  const required = (fmap.policy?.required||[]).filter(k => allowKeys.has(k));
  const missingReq = required.filter(k => !fields[k]);
  if (missingReq.length && llm?.resolveMissing) {
    const rescue = await llm.resolveMissing(missingReq, {raw, tradecard});
    for (const [k,v] of Object.entries(rescue||{})) if (put(k,v)) audit.push({key:k, strategy:"rescue", ok:true});
  }

  return { fields, audit };
};

