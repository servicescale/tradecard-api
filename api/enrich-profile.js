import { fetchFromBostonOS } from '../lib/bostonos.js';
import { transformForProfile } from '../lib/transform.js';
import { createTradecard, updateACF, uploadImageFromUrl } from '../lib/wordpress.js';

export default async function handler(req, res) {
  try {
    const slug = req.query.slug;
    if (!slug) {
      return res.status(400).json({ error: 'Missing ?slug=' });
    }

    // Fetch the raw crawl data from BostonOS
    const raw = await fetchFromBostonOS(`mk4/capsules/profile_generator/data/profiles/${slug}_raw.json`);

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

    // Create TradeCard and populate fields
    const card = await createTradecard(structured.identity_business_name || 'Untitled');
    await updateACF(card.id, structured);

    res.status(200).json({
      status: 'published',
      tradecard_id: card.id,
      tradecard_url: card.url,
      fields: structured
    });
  } catch (err) {
    console.error('Error in enrich-profile:', err);
    res.status(500).json({ error: err.message });
  }
}
