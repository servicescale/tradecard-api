"use strict";
const { loadIntentMap, expandIntentKeys, categoryOf } = require('./rule_exec');

function buildCompleteness(fields={}){
  const fmap = loadIntentMap();
  const keys = expandIntentKeys(fmap);
  const cats={};
  for (const k of keys){
    const cat=categoryOf(k);
    if(!cats[cat]) cats[cat]={total:0,present:0};
    cats[cat].total++;
    if (fields[k]) cats[cat].present++;
  }
  const categories={};
  for (const [c,{total,present}] of Object.entries(cats)){
    categories[c]={total,present,pct: total?present/total:0};
  }
  const presentOverall = keys.filter(k=>fields[k]).length;
  return { overall:{total:keys.length,present:presentOverall,pct: keys.length?presentOverall/keys.length:0}, categories };
}
module.exports = { buildCompleteness };
