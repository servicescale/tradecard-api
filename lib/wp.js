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

async function discoverAcfRoute(base, token) {
  const { json } = await fetchJson(`${base}/wp-json/`, {
    headers: authHeaders(token)
  });
  const routes = json?.routes || {};
  const order = [
    { path: '/custom/v1/acf-sync/(?P<id>\\d+)', method: 'POST', mode: 'wrapped' },
    { path: '/tradecard/v1/acf-sync/(?P<id>\\d+)', method: 'POST', mode: 'wrapped' },
    { path: '/acf/v3/tradecard/(?P<id>\\d+)', mode: 'raw' }
  ];
  const found = [];
  for (const cand of order) {
    if (routes[cand.path]) {
      let method = cand.method;
      if (!method) {
        const methods = routes[cand.path].methods;
        if (Array.isArray(methods)) {
          method = methods.includes('PATCH') ? 'PATCH' : (methods[0] || 'POST');
        } else {
          method = 'POST';
        }
      }
      found.push({ path: cand.path, method, mode: cand.mode });
    }
  }
  return found;
}

async function acfSync(base, token, id, fields) {
  const headers = authHeaders(token);
  const routes = await discoverAcfRoute(base, token);
  const tried = [];
  let resp = { ok: false, status: 404, json: {} };

  for (const r of routes) {
    const url = `${base}/wp-json${r.path.replace('(?P<id>\\d+)', id)}`;
    const firstBody = r.mode === 'raw' ? fields : { fields };
    resp = await fetchJson(url, {
      method: r.method,
      headers,
      body: JSON.stringify(firstBody)
    });
    tried.push({ path: r.path, method: r.method });

    if (resp.status === 400 || resp.status === 422) {
      const altBody = r.mode === 'raw' ? { fields } : fields;
      resp = await fetchJson(url, {
        method: r.method,
        headers,
        body: JSON.stringify(altBody)
      });
      tried.push({ path: r.path, method: r.method });
    }

    if (resp.status !== 400 && resp.status !== 404) break;
  }

  return { ...resp, tried, accepted_keys: Object.keys(fields) };
}

module.exports = { createPost, uploadFromUrl, acfSync, discoverAcfRoute };
