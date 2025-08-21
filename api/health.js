module.exports = async function handler(req, res) {
  const env = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    WP_BASE: !!process.env.WP_BASE,
    WP_BEARER: !!process.env.WP_BEARER,
    BOSTONOS_API_TOKEN: !!process.env.BOSTONOS_API_TOKEN
  };
  res.status(200).json({ ok: true, env, node: process.version });
};
