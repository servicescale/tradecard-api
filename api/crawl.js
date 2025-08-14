// See chat history for full endpoint implementationimport cheerio from 'cheerio';

export default async function handler(req, res) {
  let url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // If missing protocol, prepend https://
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const html = await fetch(url).then(r => r.text());
    const base = new URL(url);
    const $ = cheerio.load(html);

    const images = new Set();
    const links = new Set();
    const headings = [];
    const text = [];
    const menuLinks = [];
    const socialLinks = {};

    const SOCIAL_DOMAINS = {
      facebook: ['facebook.com', 'm.facebook.com'],
      instagram: ['instagram.com'],
      linkedin: ['linkedin.com'],
      youtube: ['youtube.com', 'm.youtube.com'],
      youtu: ['youtu.be'],
      tiktok: ['tiktok.com'],
      twitter: ['twitter.com', 'mobile.twitter.com'],
      x: ['x.com'],
      pinterest: ['pinterest.com']
    };

    // Menu links
    $('nav a, header a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#')) {
        try {
          const full = new URL(href, base).href;
          menuLinks.push(full);
        } catch {}
      }
    });

    // Headings
    $('h1,h2,h3,h4,h5,h6').each((_, el) => {
      const content = $(el).text().trim();
      if (content.length > 0) headings.push(content);
    });

    // Text
    $('p,li').each((_, el) => {
      const content = $(el).text().trim();
      if (content.length > 0) text.push(content);
    });

    // Images
    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src) {
        try {
          images.add(new URL(src, base).href);
        } catch {}
      }
    });

    $('[style*="background-image"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const match = /url\(['"]?([^"')]+)['"]?\)/i.exec(style);
      if (match && match[1]) {
        try {
          images.add(new URL(match[1], base).href);
        } catch {}
      }
    });

    // Links + Socials
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        try {
          const full = new URL(href, base).href;
          links.add(full);

          const cleanUrl = full.split('?')[0].split('#')[0];
          for (const [platform, domains] of Object.entries(SOCIAL_DOMAINS)) {
            if (domains.some(domain => cleanUrl.includes(domain))) {
              if (!socialLinks[platform]) {
                socialLinks[platform] = cleanUrl;
              }
            }
          }
        } catch {}
      }
    });

    res.status(200).json({
      page: {
        url,
        title: $('title').text().trim(),
        headings,
        text,
        images: Array.from(images),
        links: Array.from(links)
      },
      social_links: socialLinks,
      menu_links: Array.from(new Set(menuLinks))
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Scrape failed' });
  }
}
