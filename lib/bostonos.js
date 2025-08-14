const BOSTONOS_BASE = 'https://bostonos-runtime-api.yellow-rice-fbef.workers.dev';
const BUCKET = 'tradecard';
const TOKEN = process.env.BOSTONOS_API_TOKEN;

export async function saveToBostonOS(key, content) {
  const res = await fetch(`${BOSTONOS_BASE}/${BUCKET}/file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: JSON.stringify({ key, content: JSON.stringify(content) })
  });
  if (!res.ok) throw new Error(`BostonOS save failed: ${await res.text()}`);
  return { key };
}

export async function fetchFromBostonOS(key) {
  const res = await fetch(`${BOSTONOS_BASE}/${BUCKET}/file?key=${encodeURIComponent(key)}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (!res.ok) throw new Error(`BostonOS fetch failed: ${res.statusText}`);
  return res.json();
}