#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const dest = process.env.MISS_LOG;
const ext = dest ? path.extname(dest).toLowerCase() : '.jsonl';

function serialize(entry = {}) {
  if (ext === '.csv') {
    const cols = ['key', 'snippet', 'rule', 'suggestion'];
    return (
      cols
        .map((k) => {
          let v = entry[k];
          if (v === undefined || v === null) v = '';
          if (typeof v === 'object') v = JSON.stringify(v);
          v = String(v).replace(/"/g, '""');
          return `"${v}"`;
        })
        .join(',') + '\n'
    );
  }
  return JSON.stringify(entry) + '\n';
}

function logMiss(entry = {}) {
  if (!dest) return;
  try {
    fs.appendFileSync(dest, serialize(entry));
  } catch {}
}

module.exports = { logMiss };
