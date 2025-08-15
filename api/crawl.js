import fetch from 'node-fetch';
import cheerio from 'cheerio';

export default async function handler(req, res) {
  const url = req.query.url;

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Invalid or missing URL' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradeCardBot/1.0)'
      },
      timeout: 10000
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Target site returned ${response.status}` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $('title').text().trim();
    const headings = [];
    $('h1,h2,h3').each((_, el) => headings.push($(el).text().trim()));

    res.status(200).json({
      status: 'ok',
      url,
      title,
      headings
    });

  } catch (err) {
    console.error('[crawl error]', err);
    res.status(500).json({ error: 'Scrape failed', detail: err.message });
  }
}
