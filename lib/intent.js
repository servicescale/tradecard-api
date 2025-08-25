const { getAllowKeys } = require('./acf_contract');
const imap = require('./intent_map');
const { runExecutor } = require('./executor');
const llm = require('./llm_resolver');
const { completeness } = require('./completeness');

function normalizePhone(p = '') {
  let digits = String(p).replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = '61' + digits.slice(1);
  if (!digits.startsWith('61')) digits = '61' + digits;
  return '+' + digits;
}

const helpers = {
  detSeed({ raw = {}, tradecard = {} }) {
    const out = {};
    let website = raw.meta?.canonical || '';
    if (!website && Array.isArray(raw.jsonld)) {
      for (const j of raw.jsonld) {
        let obj = j;
        if (typeof obj === 'string') {
          try { obj = JSON.parse(obj); } catch {}
        }
        if (obj && typeof obj.url === 'string') { website = obj.url; break; }
      }
    }
    if (!website && tradecard?.contacts?.website) website = tradecard.contacts.website;
    if (website) out.identity_website_url = String(website).trim();

    let logo = raw.meta?.['og:image'];
    if (!logo && Array.isArray(raw.images)) {
      const img = raw.images.find((i) => /logo|brand|icon/i.test(i.alt || ''));
      if (img) logo = img.src || '';
    }
    if (logo) out.identity_logo_url = String(logo).trim();

    const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    for (const a of raw.anchors || []) {
      const href = a.href || '';
      if (href.startsWith('mailto:')) { out.identity_email = href.slice(7).toLowerCase(); break; }
      const text = a.text || '';
      const m = href.match(emailRx) || text.match(emailRx);
      if (m) { out.identity_email = m[0].toLowerCase(); break; }
    }

    const phoneRx = /(\+?61|0)[0-9\s().-]{8,}/;
    for (const a of raw.anchors || []) {
      const href = a.href || '';
      if (href.startsWith('tel:')) { out.identity_phone = normalizePhone(href.slice(4)); break; }
      const text = a.text || '';
      const m = href.match(phoneRx) || text.match(phoneRx);
      if (m) { out.identity_phone = normalizePhone(m[0]); break; }
    }

    const socialMap = {
      'facebook.com': 'social_links_facebook',
      'instagram.com': 'social_links_instagram',
      'linkedin.com': 'social_links_linkedin',
      'twitter.com': 'social_links_twitter',
      'x.com': 'social_links_twitter',
      'youtube.com': 'social_links_youtube',
      'youtu.be': 'social_links_youtube',
      'tiktok.com': 'social_links_tiktok',
      'pinterest.com': 'social_links_pinterest'
    };
    const seen = new Set();
    for (const a of raw.anchors || []) {
      let u;
      try { u = new URL(a.href); } catch { continue; }
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      for (const d in socialMap) {
        if (host === d || host.endsWith('.' + d)) {
          const key = socialMap[d];
          if (!seen.has(key)) {
            out[key] = a.href;
            seen.add(key);
          }
        }
      }
    }
    return out;
  },
  detResolve(key, rule, ctx) {
    return '';
  },
  derive(key, rule, { fields }) {
    if (key === 'identity_services') {
      const titles = [];
      for (let i = 1; i <= 3; i++) {
        const t = fields[`service_${i}_title`];
        if (t) titles.push(t);
      }
      return titles.join(', ');
    }
    return '';
  }
};

exports.applyIntent = async function applyIntent(tradecard = {}, { raw = {} } = {}) {
  const allowSet = getAllowKeys();
  const map = imap.loadIntentMap();
  const { fields, audit } = await runExecutor({ map, allowSet, raw, tradecard, llm, helpers });
  const trace = [];
  trace.push({ stage: 'rule_apply', audit });
  trace.push({ stage: 'intent_coverage', before: Object.keys(map).length, after: Object.keys(fields).length, sample_sent: Object.keys(fields).slice(0, 10) });
  trace.push({ stage: 'completeness', report: completeness(map, fields) });
  return { fields, sent_keys: Object.keys(fields), audit, trace };
};
