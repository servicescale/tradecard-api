const { ReadableStream } = require('node:stream/web');

module.exports = function mockFetch(routes = {}) {
  const orig = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const key = typeof url === 'string' ? url : url.url;
    if (!(key in routes)) throw new Error('No mock for ' + key);
    const cfg = routes[key];
    const status = cfg.status ?? 200;
    const ok = cfg.ok ?? (status >= 200 && status < 300);
    const body = cfg.body !== undefined
      ? (typeof cfg.body === 'string' ? cfg.body : JSON.stringify(cfg.body))
      : JSON.stringify(cfg.json ?? {});
    return {
      ok,
      status,
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
  return () => { global.fetch = orig; };
};
