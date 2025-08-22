const { ReadableStream } = require('node:stream/web');

module.exports = function mockFetch(routes = {}) {
  const orig = global.fetch;
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const key = typeof url === 'string' ? url : url.url;
    calls.push({ url: key, opts });
    if (!(key in routes)) throw new Error('No mock for ' + key);
    let cfg = routes[key];
    if (Array.isArray(cfg)) cfg = cfg.shift();
    if (typeof cfg === 'function') cfg = await cfg(url, opts);
    if (!cfg) throw new Error('No mock for ' + key);
    const status = cfg.status ?? 200;
    const ok = cfg.ok ?? (status >= 200 && status < 300);
    const body = cfg.body !== undefined
      ? (typeof cfg.body === 'string' ? cfg.body : JSON.stringify(cfg.body))
      : JSON.stringify(cfg.json ?? {});
    const headers = cfg.headers || {};
    return {
      ok,
      status,
      headers: { get: (h) => headers[h.toLowerCase()] },
      json: async () => cfg.json !== undefined ? cfg.json : JSON.parse(body),
      text: async () => body,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        }
      })
    };
  };
  const restore = () => { global.fetch = orig; };
  restore.calls = calls;
  return restore;
};
