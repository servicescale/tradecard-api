// api/index.js
// Health check and API index listing available endpoints.

module.exports = async function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    endpoints: [
      '/api/scrape',
      '/api/crawl',
      '/api/build',
      '/api/openapi.json'
    ]
  });
};

