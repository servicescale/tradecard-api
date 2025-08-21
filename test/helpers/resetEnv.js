module.exports = function resetEnv(overrides = {}) {
  const keep = { NODE_ENV: process.env.NODE_ENV };
  process.env = { ...keep, ...overrides };
};
