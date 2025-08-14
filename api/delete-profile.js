import { deleteTradecard } from '../lib/wordpress.js';

export default async function handler(req, res) {
  try {
    const postId = req.query.id;

    if (!postId) {
      return res.status(400).json({ error: 'Missing ?id=' });
    }

    // Delete the TradeCard from WordPress
    await deleteTradecard(postId);

    res.status(200).json({
      status: 'deleted',
      tradecard_id: postId
    });
  } catch (err) {
    console.error('Error in delete-profile:', err);
    res.status(500).json({ error: err.message });
  }
}
