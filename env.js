// env.js
// Helpers to read environment variables.

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var ${key}`);
  return value;
}

module.exports = { requireEnv };
