// lib/acf_contract.js
// Load ACF allowlist from config and expose as a Set. Includes optional
// aliases to bridge historical typos in production data.

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const aliases = {
  trust_award_link: 'trsut_award_link',
  service_3_inclusion_3: 'service_3_Inclusion_3'
};

function getAllowKeys() {
  const file = fs.readFileSync(
    path.join(__dirname, '..', 'config', 'acf_contract.yaml'),
    'utf8'
  );
  const data = YAML.parse(file) || {};
  const allow = Array.isArray(data.allow) ? data.allow : [];
  return new Set(allow);
}

module.exports = { getAllowKeys, aliases };

