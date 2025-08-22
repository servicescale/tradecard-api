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
  const url = `${base}/wp-json/custom/v1/acf-sync/${id}`;
  const headers = authHeaders(token);
  const tried = ['wrapped'];

  let resp = await fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fields })
  });

  if (resp.status === 400 || resp.status === 422) {
    tried.push('raw');
    resp = await fetchJson(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(fields)
    });
  }

  return { ...resp, tried, accepted_keys: Object.keys(fields) };
}

module.exports = { createPost, uploadFromUrl, acfSync };
