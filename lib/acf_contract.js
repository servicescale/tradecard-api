// lib/acf_contract.js
// Load ACF allowlist from config and expose as a Set.

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function getAllowKeys() {
  const file = fs.readFileSync(path.join(__dirname, '..', 'config', 'acf_contract.yaml'), 'utf8');
  const data = YAML.parse(file) || {};
  const allow = Array.isArray(data.allow) ? data.allow : [];
  return new Set(allow);
}

module.exports = { getAllowKeys };

