const fs = require('fs');
const path = require('path');
let YAML;
try { YAML = require('yaml'); }
catch { YAML = require('js-yaml'); }

function readYaml(rel) {
  const candidates = [
    path.join(process.cwd(), rel),
    path.join(__dirname, '..', rel),
    path.resolve(rel),
  ];
  for (const p of candidates) {
    try {
      const src = fs.readFileSync(p, 'utf8');
      return YAML.parse(src);
    } catch {}
  }
  throw new Error(`YAML not found: ${rel}`);
}

module.exports = { readYaml };
