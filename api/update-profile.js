import { transformForProfile } from '../lib/transform.js';
import { updateACF, uploadImageFromUrl } from '../lib/wordpress.js';

export default async function handler(req, res) {
  try {
    const postId = req.query.id;
    const url = req.query.url;

    if (!postId || !url) {
      return res.status(400).json({ error: 'Missing ?id= & ?url=' });
    }

    // Crawl the site using our crawl endpoint
    const crawlRes = await fetch(
      `${req.headers.host.startsWith('localhost') ? 'http' : 'https'}://${req.headers.host}/api/crawl?url=${encodeURIComponent(url)}`
    );
    if (!crawlRes.ok) {
      throw new Error(`Crawl failed: ${await crawlRes.text()}`);
    }
    const raw = await crawlRes.json();

    // Transform into ACF fields
    const structured = transformForProfile(raw);

    // Upload image fields to WordPress
    for (const [field, value] of Object.entries(structured)) {
      if (field.endsWith('_url') && typeof value === 'string' && value.startsWith('http')) {
        try {
          const imgRes = await uploadImageFromUrl(value);
          structured[field] = imgRes.url;
        } catch (err) {
          console.warn(`Image upload failed for ${field}: ${value}`, err);
        }
      }
    }

    // Update ACF fields in WordPress
    await updateACF(postId, structured);

    res.status(200).json({
      status: 'updated',
      tradecard_id: postId,
      fields: structured
    });
  } catch (err) {
    console.error('Error in update-profile:', err);
    res.status(500).json({ error: err.message });
  }
}
