export default async function handler(req, res) {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'Missing ?url parameter' });
    }

    // Simple fetch to prove it works on Vercel
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: `Fetch failed with status ${response.status}` });
    }

    const text = await response.text();

    return res.status(200).json({
      status: 'ok',
      url,
      length: text.length
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
