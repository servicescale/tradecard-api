function computeCoverage(clean = {}, allow = new Set()) {
  const total = allow.size;
  if (!total) return 0;
  let count = 0;
  for (const key of allow) {
    if (clean[key] !== undefined && clean[key] !== null) count++;
  }
  return count / total;
}

module.exports = { computeCoverage };
