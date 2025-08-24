// lib/gmb_lookup.js
// Fetch Google Business details like rating and review count.

async function gmbLookup(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('bad_status');
    const data = await res.json().catch(() => ({}));
    return {
      rating: data.rating ?? data.ratingValue ?? null,
      reviewCount: data.review_count ?? data.reviewCount ?? null,
      url: data.url || url,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { gmbLookup };
