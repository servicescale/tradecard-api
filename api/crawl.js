export default async function handler(req, res) {
  return res.status(200).json({
    message: "crawl endpoint working",
    receivedUrl: req.query.url || null
  });
}