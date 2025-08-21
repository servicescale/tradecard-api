function flatten(obj, prefix = '', res = {}) {
  for (const [key, val] of Object.entries(obj || {})) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      flatten(val, newKey, res);
    } else if (Array.isArray(val)) {
      if (val.length) res[newKey] = val.join(', ');
    } else if (val !== undefined && val !== null && val !== '') {
      res[newKey] = val;
    }
  }
  return res;
}

async function fetchJson(url, options, step) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { ...(options || {}), signal: controller.signal });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    step.ok = res.ok;
    step.status = res.status;
    step.response = json;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json;
  } catch (err) {
    step.ok = false;
    step.error = err.message || String(err);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function pushToWordpress(tradecard) {
  const base = process.env.WP_BASE;
  const bearer = process.env.WP_BEARER;
  if (!base || !bearer) {
    return { skipped: true, reason: 'Missing WP_BASE or WP_BEARER' };
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`
  };
  const steps = [];

  try {
    // Step 1: create CPT post
    const stepCreate = { step: 'create-post' };
    steps.push(stepCreate);
    const post = await fetchJson(`${base}/wp-json/wp/v2/tradecard`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status: 'draft', title: tradecard?.business?.name || 'TradeCard' })
    }, stepCreate);
    const postId = post?.id;

    // Step 2: upload images
    let logoId;
    let heroId;
    const upload = async (url, name) => {
      const step = { step: `upload-${name}` };
      steps.push(step);
      const res = await fetchJson(`${base}/wp-json/tc/v1/upload`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url })
      }, step);
      return res?.id;
    };
    if (tradecard?.brand?.logo) {
      try { logoId = await upload(tradecard.brand.logo, 'logo'); } catch {}
    }
    if (tradecard?.brand?.hero) {
      try { heroId = await upload(tradecard.brand.hero, 'hero'); } catch {}
    }

    // Step 3: patch ACF fields
    const acf = flatten(tradecard);
    if (logoId) acf.logo = logoId;
    if (heroId) acf.hero = heroId;
    const fields = Object.fromEntries(Object.entries(acf).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    if (postId) {
      const stepPatch = { step: 'patch-acf' };
      steps.push(stepPatch);
      await fetchJson(`${base}/wp-json/acf/v3/tradecard/${postId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields })
      }, stepPatch);
    }

    return { ok: true, post_id: postId, details: { steps } };
  } catch (err) {
    return { ok: false, error: err.message || String(err), details: { steps } };
  }
}

module.exports = { pushToWordpress };
