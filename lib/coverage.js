const { Logger } = require('./logger');

function computeCoverage(clean = {}, allow = new Set()) {
  const total = allow.size;
  if (!total) return 0;
  let count = 0;
  for (const key of allow) {
    if (clean[key] !== undefined && clean[key] !== null) count++;
  }
  return count / total;
}

function logDroppedField(key, reason, value) {
  Logger.log('COVERAGE', `Dropped field ${key}`, { reason, value });
}

module.exports = { computeCoverage, logDroppedField };
