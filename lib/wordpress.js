const WP_BASE = process.env.WP_API_BASE;
const WP_TOKEN = process.env.WP_API_TOKEN;

async function wpFetch(endpoint, options = {}) {
  const res = await fetch(`${WP_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WP_TOKEN}`,
      ...options.headers
    }
  });
  if (!res.ok) throw new Error(`WordPress API error (${endpoint}): ${await res.text()}`);
  return res.json();
}

export async function createTradecard(title, status = 'publish') {
  return wpFetch('/wp-json/tradecard/v1/create', {
    method: 'POST',
    body: JSON.stringify({ title, status })
  });
}

export async function updateACF(postId, fields) {
  return wpFetch(`/wp-json/tradecard/v1/update-acf?id=${postId}`, {
    method: 'POST',
    body: JSON.stringify(fields)
  });
}

export async function uploadImageFromUrl(url) {
  return wpFetch('/wp-json/tradecard/v1/upload-image', {
    method: 'POST',
    body: JSON.stringify({ url })
  });
}

export async function deleteTradecard(postId) {
  return wpFetch(`/wp-json/tradecard/v1/delete?id=${postId}`, { method: 'DELETE' });
}