// lib/parse.js
// Parse HTML and extract structured data (headings, images, links, socials, contacts).

const cheerio = require('cheerio');
const { ALLOWED_PROTOCOLS } = require('./fetch_html');

const isHttp = (u) => { try { return ALLOWED_PROTOCOLS.has(new URL(u).protocol); } catch { return false; } };
const clean = (abs) => { try { const u = new URL(abs); u.search=''; u.hash=''; return u.toString(); } catch { return abs; } };

function* extractCssUrls(cssText = '') {
  const re = /url\(\s*(['"]?)([^"'()]+)\1\s*\)/ig;
  let m; while ((m = re.exec(cssText)) !== null) yield m[2];
}
function* extractImports(cssText = '') {
  const re = /@import\s+(?:url\(\s*)?['"]?([^"'()]+)['"]?\s*\)?/ig;
  let m; while ((m = re.exec(cssText)) !== null) yield m[1];
}

function resolveUrl(u, base) {
  if (!u) return null;
  try { return new URL(u, base).toString(); } catch { return null; }
}

function parseServicePanels($, base) {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const services = [];
  $('.service-panel').each((_, el) => {
    if (services.length >= 3) return;
    const $p = $(el);
    const svc = {};
    const img = $p.find('img').attr('src');
    if (img) svc.image_url = resolveUrl(img, base);
    const price = norm($p.find('.price').first().text());
    if (price) svc.price = price;
    const priceNote = norm($p.find('.price-note').first().text());
    if (priceNote) svc.price_note = priceNote;
    const cta = $p.find('.cta').first();
    if (cta.length) {
      const label = norm(cta.text());
      if (label) svc.cta_label = label;
      const href = cta.attr('href');
      if (href) svc.cta_link = resolveUrl(href, base);
    }
    const modes = norm($p.find('.delivery-modes').first().text());
    if (modes) svc.delivery_modes = modes.split(/[,|]/).map(norm).filter(Boolean).join(',');
    const inclusions = $p.find('.inclusions li').map((_, li) => norm($(li).text())).get().filter(Boolean);
    if (inclusions[0]) svc.inclusion_1 = inclusions[0];
    if (inclusions[1]) svc.inclusion_2 = inclusions[1];
    if (inclusions[2]) svc.inclusion_3 = inclusions[2];
    const video = $p.find('video').attr('src');
    if (video) svc.video_url = resolveUrl(video, base);
    let tags = [];
    tags = tags.concat($p.find('.tags li').map((_, li) => norm($(li).text())).get());
    const dataTags = ($p.attr('data-tags') || '').split(',').map(norm).filter(Boolean);
    tags = Array.from(new Set([...tags, ...dataTags]));
    if (tags.length) {
      svc.tags = tags.join(',');
      const panelTag = tags.find(t => /^featured (service|project|product)$/i.test(t));
      if (panelTag) svc.panel_tag = panelTag.toLowerCase();
    }
    services.push(svc);
  });
  return services;
}

function parseProjects($, base) {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const projects = [];
  $('.project').each((_, el) => {
    const $p = $(el);
    const proj = {};
    const img = $p.find('img').attr('src');
    if (img) proj.image_url = resolveUrl(img, base);
    const title = norm($p.find('.title, h3, h2').first().text());
    if (title) proj.title = title;
    const href = $p.find('a').attr('href');
    if (href) proj.cta_link = resolveUrl(href, base);
    projects.push(proj);
  });
  return projects;
}

async function fetchTextWithGuards(url, { timeoutMs = 8000, byteLimit = 512_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'text/css,*/*;q=0.1',
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let size = 0, chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > byteLimit) throw new Error('SIZE_LIMIT');
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally { clearTimeout(timer); }
}

async function collectCssAssets(entryUrls, baseForResolve, { maxFiles = 20, maxDepth = 2 } = {}) {
  const queue = [];
  for (const href of entryUrls) {
    try { queue.push(new URL(href, baseForResolve).toString()); } catch {}
  }
  const visited = new Set();
  const assets = new Set();
  let remainingDepth = maxDepth;

  while (queue.length && visited.size < maxFiles) {
    const cssUrl = queue.shift();
    if (visited.has(cssUrl)) continue;
    visited.add(cssUrl);

    let css; try { css = await fetchTextWithGuards(cssUrl); } catch { continue; }

    for (const raw of extractCssUrls(css)) {
      try {
        const abs = new URL(raw, cssUrl).toString();
        if (isHttp(abs)) assets.add(abs);
      } catch {}
    }

    if (remainingDepth > 0 && visited.size < maxFiles) {
      for (const imp of extractImports(css)) {
        try {
          const abs = new URL(imp, cssUrl).toString();
          if (!visited.has(abs)) queue.push(abs);
        } catch {}
      }
      remainingDepth -= 1;
    }
  }
  return Array.from(assets);
}

async function parse(html, pageUrl) {
  const $ = cheerio.load(html);
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();

  let baseForResolve = pageUrl;
  const baseHref = $('base[href]').attr('href');
  if (baseHref) { try { baseForResolve = new URL(baseHref, pageUrl).toString(); } catch {} }

  const title = ($('title').first().text() || '').trim() || null;
  const headings = {
    h1: $('h1').map((_, el) => norm($(el).text())).get().filter(Boolean),
    h2: $('h2').map((_, el) => norm($(el).text())).get().filter(Boolean),
    h3: $('h3').map((_, el) => norm($(el).text())).get().filter(Boolean),
  };

  const images = [];
  const seen = new Set();
  const add = (u, base = baseForResolve) => {
    if (!u) return;
    try {
      const abs = new URL(u, base).toString();
      if (isHttp(abs)) {
        const c = clean(abs);
        if (!seen.has(c)) { seen.add(c); images.push(c); }
      }
    } catch {}
  };

  $('img').each((_, el) => {
    const $el = $(el);
    add($el.attr('src'));
    add($el.attr('data-src'));
    add($el.attr('data-lazy-src'));
    add($el.attr('data-original'));
    const srcset = $el.attr('srcset');
    if (srcset) srcset.split(',').forEach(p => add(p.trim().split(/\s+/)[0]));
  });

  $('[style*="background"]').each((_, el) => {
    for (const u of extractCssUrls($(el).attr('style') || '')) add(u);
  });
  $('style').each((_, el) => {
    for (const u of extractCssUrls($(el).html() || '')) add(u);
  });

  const sheetHrefs = $('link[href]').filter((_, el) => {
    const rel = (($(el).attr('rel') || '') + '').toLowerCase();
    return /\bstylesheet\b/.test(rel) || (/\b(preload|prefetch)\b/.test(rel) && ($(el).attr('as') || '') === 'style');
  }).map((_, el) => $(el).attr('href')).get();

  const importsInline = [];
  $('style').each((_, el) => {
    for (const imp of extractImports($(el).html() || '')) importsInline.push(imp);
  });

  const cssAssets = await collectCssAssets(Array.from(new Set([...sheetHrefs, ...importsInline])), baseForResolve, { maxFiles: 20, maxDepth: 2 });
  cssAssets.forEach(u => add(u, pageUrl));

  add($('link[rel="icon"]').attr('href'));
  add($('link[rel="apple-touch-icon"]').attr('href'));
  add($('meta[property="og:image"]').attr('content'));
  add($('meta[name="twitter:image"]').attr('content'));

  const anchors = $('a[href]')
    .map((_, el) => {
      const href = $(el).attr('href');
      try {
        return {
          href: new URL(href, baseForResolve).toString(),
          text: norm($(el).text())
        };
      } catch {
        return null;
      }
    })
    .get()
    .filter(Boolean);
  const links = anchors.map((a) => a.href);

  const meta = {};
  $('meta').each((_, el) => {
    const $el = $(el);
    const name = ($el.attr('name') || $el.attr('property') || '').toLowerCase();
    const content = $el.attr('content');
    if (name && content) meta[name] = content.trim();
  });
  const canon = $('link[rel="canonical"]').attr('href');
  if (canon) meta.canonical = canon;

  const jsonld = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    if (!txt) return;
    try {
      const obj = JSON.parse(txt);
      if (obj) jsonld.push(obj);
    } catch {}
  });

  const text_blocks = [];
  const seenText = new Set();
  $('body')
    .find('p,li,span,div,td,th,h1,h2,h3,h4,h5,h6')
    .each((_, el) => {
      const t = norm($(el).text());
      if (t && t.length <= 400 && !seenText.has(t)) {
        seenText.add(t);
        text_blocks.push(t);
      }
    });

  const socials = [];
  const emails = [];
  const phones = [];
  const profile_videos = [];
  const contact_forms = [];
  const awards = [];
  const cssVars = {};

  const collectVars = (css = '') => {
    const re = /--([a-z0-9_-]+):\s*([^;]+);/gi;
    let m;
    while ((m = re.exec(css)) !== null) {
      cssVars[m[1]] = m[2].trim();
    }
  };
  collectVars($('html').attr('style'));
  collectVars($('body').attr('style'));
  $('style').each((_, el) => collectVars($(el).html() || ''));

  $('iframe[src],video[src],video source[src]').each((_, el) => {
    const src = $(el).attr('src');
    try {
      const abs = new URL(src, baseForResolve).toString();
      if (isHttp(abs)) profile_videos.push(abs);
    } catch {}
  });

  $('form').each((_, el) => {
    const action = $(el).attr('action') || '';
    const idClass = ($(el).attr('id') || '') + ' ' + ($(el).attr('class') || '');
    if (/(contact|enquiry|inquiry)/i.test(action) || /(contact|enquiry|inquiry)/i.test(idClass)) {
      try {
        const abs = new URL(action, baseForResolve).toString();
        if (isHttp(abs)) contact_forms.push(abs);
      } catch {}
    }
  });

  $('a[href]').each((_, el) => {
    const txt = norm($(el).text());
    if (/award/i.test(txt)) {
      let href = $(el).attr('href');
      try { href = new URL(href, baseForResolve).toString(); } catch {}
      awards.push({ text: txt, href });
    }
  });

  for (const href of links) {
    if (!href) continue;
    const low = href.toLowerCase();
    if (low.startsWith('mailto:')) {
      const addr = href.replace(/^mailto:/i, '').trim();
      if (addr) emails.push(addr);
      continue;
    }
    if (low.startsWith('tel:')) {
      const tel = href.replace(/^tel:/i, '').trim();
      if (tel) phones.push(tel);
      continue;
    }
    const platform =
      low.includes('facebook.com')  ? 'facebook'  :
      low.includes('instagram.com') ? 'instagram' :
      (low.includes('x.com') || low.includes('twitter.com')) ? 'twitter' :
      low.includes('linkedin.com')  ? 'linkedin'  :
      (low.includes('youtube.com') || low.includes('youtu.be')) ? 'youtube' :
      low.includes('tiktok.com')    ? 'tiktok'    :
      low.includes('pinterest.')    ? 'pinterest' :
      null;
    if (platform) socials.push({ platform, url: href });
  }

  const uniqBy = (arr, keyer) => Array.from(new Map(arr.map(v => [keyer(v), v])).values());
  const uniqueSocials = uniqBy(socials, s => `${s.platform}:${s.url}`);
  const uniqueEmails  = Array.from(new Set(emails));
  const uniquePhones  = Array.from(new Set(phones));


  const theme_colors = {};
  if (cssVars['primary-color']) theme_colors.primary = cssVars['primary-color'];
  if (cssVars['accent-color']) theme_colors.accent = cssVars['accent-color'];
  if (!theme_colors.primary && typeof meta['theme-color'] === 'string')
    theme_colors.primary = meta['theme-color'];
  if (!theme_colors.accent && typeof meta['msapplication-tilecolor'] === 'string')
    theme_colors.accent = meta['msapplication-tilecolor'];

  const testimonialContainers =
    $("[class*='testimonial'],[id*='testimonial'],[class*='review'],[id*='review']")
      .filter((_, el) => !$(el).parents("[class*='testimonial'],[id*='testimonial'],[class*='review'],[id*='review']").length);
  const testimonials = [];
  const seenTesti = new Set();
  testimonialContainers.each((_, el) => {
    const $el = $(el);
    const quote = norm(
      $el
        .find("[class*='quote'],blockquote,q")
        .first()
        .text()
    );
    const reviewer = norm(
      $el
        .find("[class*='reviewer'],[class*='author'],[itemprop='author'],[itemprop='name']")
        .first()
        .text()
    );
    const location = norm(
      $el
        .find("[class*='location'],[class*='suburb'],[class*='city']")
        .first()
        .text()
    );
    const job_type = norm(
      $el
        .find("[class*='job'],[class*='service']")
        .first()
        .text()
    );
    let source_label = norm(
      $el
        .find("[class*='source'],[class*='platform']")
        .first()
        .text()
    );
    let source_url = $el.find('a[href]').first().attr('href') || '';
    if (source_url) {
      try {
        source_url = new URL(source_url, baseForResolve).toString();
      } catch {
        source_url = '';
      }
    }
    if (!source_label) {
      source_label = norm($el.find('a[href]').first().text());
    }
    const key = `${quote}|${reviewer}|${source_url}`;
    if ((quote || reviewer || source_url) && !seenTesti.has(key)) {
      seenTesti.add(key);
      testimonials.push({
        quote: quote || null,
        reviewer: reviewer || null,
        location: location || null,
        source_label: source_label || null,
        source_url: source_url || null,
        job_type: job_type || null,
      });


  const service_panels = parseServicePanels($, baseForResolve);
  const projects = parseProjects($, baseForResolve);

  // Owner name/title/headshot
  const ownerName =
    $('.owner .name').first().text().trim() ||
    $('[data-owner-name]').first().text().trim() ||
    null;
  const ownerTitle =
    $('.owner .title').first().text().trim() ||
    $('[data-owner-title]').first().text().trim() ||
    null;
  const headshotUrl =
    $('.owner img').first().attr('src') ||
    $('img[alt*="headshot" i]').first().attr('src') ||
    null;

  // Address/suburb/state/ABN/insurance text
  const addrText = $('address').first().text() || $('.address').first().text() || '';
  const addressFull = norm(addrText) || null;
  let suburb, state;
  if (addressFull) {
    const parts = addressFull.split(',').map((p) => p.trim());
    if (parts.length >= 2) {
      suburb = parts[parts.length - 2];
      const stMatch = /(NSW|QLD|VIC|WA|SA|TAS|ACT|NT)/.exec(parts[parts.length - 1]);
      if (stMatch) state = stMatch[1];
    }
  }

  const bodyText = $('body').text();
  const abnMatch = /ABN\s*[:#-]?\s*([0-9\s]{9,20})/i.exec(bodyText);
  const abn = abnMatch ? abnMatch[1].replace(/\s+/g, '') : null;
  const insuredMatch = /(fully\s+insured[^\n]*|insurance[^\n]*)/i.exec(bodyText);
  const insuredText = insuredMatch ? norm(insuredMatch[0]) : null;

  // Contact URIs
  let uriPhone, uriEmail, uriSms, uriWhatsapp, addressUri;
  for (const href of links) {
    const low = href.toLowerCase();
    if (!uriEmail && low.startsWith('mailto:')) uriEmail = href;
    if (!uriPhone && low.startsWith('tel:')) uriPhone = href;
    if (!uriSms && low.startsWith('sms:')) uriSms = href;
    if (!uriWhatsapp && (low.includes('wa.me') || low.includes('whatsapp'))) uriWhatsapp = href;
    if (!addressUri && /(google\.com\/maps|goo\.gl\/maps|maps\.app\.goo\.gl)/.test(low)) addressUri = href;
  }

  // Service tags
  const serviceTags = $('.tag').map((_, el) => norm($(el).text())).get().filter(Boolean);

  return {
    url: pageUrl,
    title,
    headings,
    images,
    links,
    anchors,
    meta,
    jsonld,
    text_blocks,
    social: uniqueSocials,
    contacts: { emails: uniqueEmails, phones: uniquePhones },
    profile_videos,
    contact_form_links: contact_forms,
    awards,
    theme_colors,
    testimonials,
    service_panels,
    projects,
    identity_owner_name: ownerName,
    identity_role_title: ownerTitle,
    identity_headshot_url: headshotUrl,
    identity_suburb: suburb,
    identity_state: state,
    identity_abn: abn,
    identity_insured: insuredText,
    identity_address: addressFull,
    identity_email: uniqueEmails[0] || null,
    identity_phone: uniquePhones[0] || null,
    identity_services: serviceTags,
    identity_website_url: pageUrl,
    identity_uri_phone: uriPhone,
    identity_uri_email: uriEmail,
    identity_uri_sms: uriSms,
    identity_uri_whatsapp: uriWhatsapp,
    identity_address_uri: addressUri,
  };
}

module.exports = { parse };
