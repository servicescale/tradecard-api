// lib/acf_contract.js
// Load ACF allowlist from config and expose as a Set. Includes optional
// aliases to bridge historical typos in production data.

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const DEFAULT_ALIASES = {
  trust_award_link: 'trsut_award_link',
  trsut_award_link: 'trust_award_link',
  service_3_inclusion_3: 'service_3_Inclusion_3',
  service_3_Inclusion_3: 'service_3_inclusion_3'
};

let cache;
function loadContract() {
  if (cache) return cache;
  const file = fs.readFileSync(
    path.join(__dirname, '..', 'config', 'acf_field.yaml'),
    'utf8'
  );
  const data = YAML.parse(file) || {};
  const allowList = Array.isArray(data.allow) ? data.allow : [];
  const aliases = { ...DEFAULT_ALIASES, ...(data.aliases || {}) };
  cache = { allowList, allowSet: new Set(allowList), aliases };
  return cache;
}

function getAllowKeys() {
  return loadContract().allowSet;
}

function getAliases() {
  return loadContract().aliases;
}

function hasACFKey(key) {
  const { allowSet, aliases } = loadContract();
  const resolved = aliases[key] || key;
  return allowSet.has(resolved);
}

module.exports = { getAllowKeys, getAliases, hasACFKey };
