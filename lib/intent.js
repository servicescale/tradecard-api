const { getAllowKeys } = require('./acf_contract');
const imap = require('./intent_map');
const { runExecutor } = require('./executor');
const llm = require('./llm_resolver');
const { completeness } = require('./completeness');
const {
  resolveIdentity,
  resolveSocialLinks,
  deriveFields,
  resolveServicePanels,
  resolveTestimonial,
  similar,
} = require('./resolve');
const { fullFramePropose } = require('./llmFullFrame');
const { readYaml } = require('./config');
const det = require('./detExtractors');

const resolveConfig = readYaml('config/resolve.yaml');

function fuzzyFindKey(obj = {}, target = '', minScore = 0.65) {
  let bestKey;
  let bestScore = 0;
  for (const k of Object.keys(obj)) {
    const score = similar(k, target);
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestScore >= minScore ? bestKey : undefined;
}


function normalizePhone(p = '') {
  let digits = String(p).replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = '61' + digits.slice(1);
  if (!digits.startsWith('61')) digits = '61' + digits;
  return '+' + digits;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
function isHttp(u = '') {
  try { return ALLOWED_PROTOCOLS.has(new URL(u).protocol); } catch { return false; }
}

const helpers = {
  detSeed({ raw = {}, tradecard = {} }) {
    const out = {};
    if (raw.identity_owner_name) out.identity_owner_name = String(raw.identity_owner_name).trim();
    if (raw.identity_role_title) out.identity_role_title = String(raw.identity_role_title).trim();
    if (raw.identity_headshot_url && isHttp(raw.identity_headshot_url)) {
      out.identity_headshot_url = String(raw.identity_headshot_url).trim();
    }
    if (raw.identity_suburb) out.identity_suburb = String(raw.identity_suburb).trim();
    if (raw.identity_state) out.identity_state = String(raw.identity_state).trim();
    if (raw.identity_abn) out.identity_abn = String(raw.identity_abn).trim();
    if (raw.identity_insured) out.identity_insured = String(raw.identity_insured).trim();
    if (raw.identity_email) out.identity_email = String(raw.identity_email).trim().toLowerCase();
    if (raw.identity_phone) out.identity_phone = normalizePhone(raw.identity_phone);
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
    if (!logo && raw.identity_logo_url) logo = raw.identity_logo_url;
    if (logo && isHttp(logo)) out.identity_logo_url = String(logo).trim();

    if (!out.identity_email) {
      const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
      for (const a of raw.anchors || []) {
        const href = a.href || '';
        if (href.startsWith('mailto:')) { out.identity_email = href.slice(7).toLowerCase(); break; }
        const text = a.text || '';
        const m = href.match(emailRx) || text.match(emailRx);
        if (m) { out.identity_email = m[0].toLowerCase(); break; }
      }
    }

    if (!out.identity_phone) {
      const phoneRx = /(\+?61|0)[0-9\s().-]{8,}/;
      for (const a of raw.anchors || []) {
        const href = a.href || '';
        if (href.startsWith('tel:')) { out.identity_phone = normalizePhone(href.slice(4)); break; }
        const text = a.text || '';
        const m = href.match(phoneRx) || text.match(phoneRx);
        if (m) { out.identity_phone = normalizePhone(m[0]); break; }
      }
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
    const raw = ctx?.raw || {};
    let val;

    if (raw[key] !== undefined && raw[key] !== null) {
      val = raw[key];
    } else if (/^service_[1-3]_/.test(key)) {
      const svc = resolveServicePanels(raw);
      val = svc[key];
    } else if (key.startsWith('testimonial_')) {
      const t = resolveTestimonial(raw.testimonials, raw.gmb_lookup?.testimonials);
      const tKey = key.replace(/^testimonial_/, '');
      val = t[tKey];
    } else {
      const fk = fuzzyFindKey(raw, key);
      if (fk !== undefined) val = raw[fk];
    }

    return val === undefined || val === null ? '' : String(val).trim();

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

function passesValidation(val, rule = {}) {
  let s = String(val || '').trim();
  if (!s) return false;
  const v = rule?.llm?.validate || {};
  if (v.regex) {
    const rx = new RegExp(v.regex.replace(/^\/|\/$/g, ''), 'i');
    if (!rx.test(s)) return false;
  }
  if (v.url && !/^https?:\/\//i.test(s)) return false;
  if (v.min_len && s.length < v.min_len) return false;
  if (v.max_len && s.length > v.max_len) return false;
  return true;
}

exports.applyIntent = async function applyIntent(tradecard = {}, { raw = {}, fullFrame = false, opts = {} } = {}) {
  const trace = [];
  const allowSet = getAllowKeys();
  const map = imap.loadIntentMap();

  const rawCounts = {
    anchors: raw.anchors?.length || 0,
    headings: raw.headings?.length || 0,
    images: raw.images?.length || 0,
    jsonld: raw.jsonld?.length || 0,
    meta: Object.keys(raw.meta || {}).length
  };
  trace.push({ stage: 'intent_input', raw_counts: rawCounts });
  const byKey = {};
  const add = (key, res, validator) => {
    if (!allowSet.has(key)) return;
    const cur = raw[key];
    const curValid = cur && (!validator || validator(cur));
    if (!curValid && res.value && (!validator || validator(res.value))) {
      raw[key] = res.value;
      byKey[key] = res.source;
    }
  };

  add('identity_email', det.getEmail(raw), (v) => det.EMAIL_RX.test(v));
  add('identity_phone', det.getPhone(raw), (v) => det.PHONE_RX.test(v));
  add('identity_website_url', det.getDomain(raw), (v) => det.URL_RX.test(v));
  add('identity_business_name', det.getBusinessName(raw), (v) => !!String(v).trim());
  add('identity_abn', det.getABN(raw), (v) => det.ABN_RX.test(v));
  const logoKey = allowSet.has('brand_logo_url')
    ? 'brand_logo_url'
    : (allowSet.has('identity_logo_url') ? 'identity_logo_url' : null);
  if (logoKey) add(logoKey, det.getLogoUrl(raw), (v) => det.URL_RX.test(v));
  const socials = det.getSocials(raw);
  for (const [k, v] of Object.entries(socials)) {
    add(k, v, (s) => det.URL_RX.test(s));
  }

  trace.push({ stage: 'det_summary', set: Object.keys(byKey).length, byKey, raw_counts: rawCounts });

  const llmClient = opts.noLLM ? { resolveField: async () => '' } : llm;
  const { fields, audit } = await runExecutor({ map, allowSet, raw, tradecard, llm: llmClient, helpers });

  const identity = resolveIdentity(raw);
  const social = resolveSocialLinks(raw.social, raw.gmb_lookup || {});
  deriveFields(fields, { tradecard_url: tradecard?.slug });
  Object.assign(fields, identity, social);

  trace.push({ stage: 'rule_apply', audit });

  if (fullFrame && !opts.noLLM) {
    const { proposals, stats } = await fullFramePropose({ raw, intentMap: map, resolveConfig, allowKeys: Array.from(allowSet), fixture: tradecard?.slug });
    const accepted = [];
    const rejected = [];
    for (const [k, v] of Object.entries(proposals || {})) {
      if (!allowSet.has(k)) { rejected.push({ key: k, reason: 'non-allowlisted' }); continue; }
      const rule = imap.ruleFor(map, k);
      if (fields[k] && passesValidation(fields[k], rule)) { rejected.push({ key: k, reason: 'already_set' }); continue; }
      if (passesValidation(v, rule)) { fields[k] = String(v); accepted.push(k); }
      else { rejected.push({ key: k, reason: 'failed-validate' }); }
    }
    trace.push({ stage: 'llm_full_frame', proposed: stats.proposed_count, accepted, rejected, has_raw: !!raw, approx_bytes: stats.bytes_in, approx_tokens: stats.tokens_est });
  }

  trace.push({ stage: 'intent_coverage', before: Object.keys(map).length, after: Object.keys(fields).length, sample_sent: Object.keys(fields).slice(0, 10) });
  trace.push({ stage: 'completeness', report: completeness(map, fields) });
  return { fields, sent_keys: Object.keys(fields), audit, trace };
};

exports.helpers = helpers;
