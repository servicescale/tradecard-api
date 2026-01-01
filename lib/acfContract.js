const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

/** @typedef {{allow:string[], aliases:Record<string,string>}} Contract */
let cache;
function load() {
  if (!cache) {
    const file = fs.readFileSync(path.join(__dirname, '..', 'config', 'acf_field.yaml'), 'utf8');
    const data = YAML.parse(file) || {};
    cache = { allow: data.allow || [], aliases: data.aliases || {} };
  }
  return cache;
}

function getAllowKeys() {
  return load().allow;
}
function hasACFKey(k) {
  const c = load();
  return c.allow.includes(c.aliases[k] || k);
}
function getAliases() {
  return load().aliases;
}

module.exports = { getAllowKeys, hasACFKey, getAliases };
