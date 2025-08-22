const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timeout);
  }
};

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
});

async function createPost(base, token, { title, status = 'draft' } = {}) {
  return fetchJson(`${base}/wp-json/wp/v2/tradecard`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ title, status })
  });
}

async function uploadFromUrl(base, token, url) {
  return fetchJson(`${base}/wp-json/tradecard/v1/upload-image-from-url`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ url })
  });
}

async function acfSync(base, token, id, fields) {
  const url = `${base.replace(/\/$/, '')}/wp-json/custom/v1/acf-sync/${id}`;
  const flat = {};
  for (const [k, v] of Object.entries(fields || {})) {
    flat[k] = v == null ? '' : String(v);
  }
  const resp = await fetchJson(url, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(flat)
  });
  return { ...resp, sent_keys: Object.keys(flat) };
}

module.exports = { createPost, uploadFromUrl, acfSync };
