const { getAllowKeys } = require('./acf_contract');
const imap = require('./intent_map');
const { runExecutor } = require('./executor');
const { resolveMVF } = require('./mvf_resolver');
const llm = require('./llm_resolver');
const {
  resolveIdentity,
  resolveSocialLinks,
  deriveFields,
  resolveServicePanels,
  resolveTestimonial,
  resolveServiceDetails,
  similar,
} = require('./resolve');
const { proposeForUnresolved } = require('./llmFullFrame');
const { readYaml } = require('./config');
const det = require('./detExtractors');
const { logMiss } = require('../scripts/log-misses');

const resolveConfig = readYaml('config/resolve.yaml');
const serviceCache = new WeakMap();

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

function getServiceDetails(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  if (serviceCache.has(raw)) return serviceCache.get(raw);
  const details = resolveServiceDetails(raw);
  serviceCache.set(raw, details);
  return details;
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

function isGoogleMaps(u = '') {
  try {
    const url = new URL(u);
    const h = url.hostname.toLowerCase();
    if (h === 'maps.app.goo.gl') return true;
    if (h === 'goo.gl' && url.pathname.startsWith('/maps')) return true;
    if (h.includes('google.') && (h.startsWith('maps.') || url.pathname.includes('/maps'))) return true;
    return false;
  } catch {
    return false;
  }
}

function extractGmapsAddress(u = '') {
  try {
    const url = new URL(u);
    const params = ['q', 'query', 'destination', 'daddr'];
    let addr;
    for (const p of params) {
      const v = url.searchParams.get(p);
      if (v) { addr = v; break; }
    }
    if (!addr) {
      const parts = url.pathname.split('/');
      const idx = parts.indexOf('place');
      if (idx >= 0 && parts[idx + 1]) addr = parts[idx + 1];
    }
    if (addr) {
      return decodeURIComponent(addr).replace(/\+/g, ' ').trim();
    }
  } catch {}
  return '';
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
    if (raw.identity_address) out.identity_address = String(raw.identity_address).trim();
    if (raw.identity_address_uri && isHttp(raw.identity_address_uri)) {
      out.identity_address_uri = String(raw.identity_address_uri).trim();
    }
    if (raw.identity_uri_email && /^mailto:/i.test(raw.identity_uri_email)) {
      out.identity_uri_email = String(raw.identity_uri_email).trim();
    }
    if (
      raw.identity_uri_whatsapp &&
      ((/^whatsapp:/i.test(raw.identity_uri_whatsapp)) ||
        (/^https?:\/\/(?:wa.me|api.whatsapp.com)\//i.test(raw.identity_uri_whatsapp) && isHttp(raw.identity_uri_whatsapp)))
    ) {
      out.identity_uri_whatsapp = String(raw.identity_uri_whatsapp).trim();
    }
    if (raw.identity_uri_sms && /^sms:/i.test(raw.identity_uri_sms)) {
      out.identity_uri_sms = String(raw.identity_uri_sms).trim();
    }
    if (raw.service_areas_csv) {
      out.service_areas_csv = String(raw.service_areas_csv).trim();
    }
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

    if (
      !out.identity_uri_email ||
      !out.identity_uri_whatsapp ||
      !out.identity_uri_sms ||
      !out.identity_address_uri ||
      !out.identity_address
    ) {
      for (const a of raw.anchors || []) {
        const href = a.href || '';
        if (!out.identity_uri_email && /^mailto:/i.test(href)) {
          out.identity_uri_email = href.trim();
        }
        if (
          !out.identity_uri_whatsapp &&
          (/^whatsapp:/i.test(href) || /^https?:\/\/(?:wa.me|api.whatsapp.com)\//i.test(href))
        ) {
          if (!href.startsWith('http') || isHttp(href)) {
            out.identity_uri_whatsapp = href.trim();
          }
        }
        if (!out.identity_uri_sms && /^sms:/i.test(href)) {
          out.identity_uri_sms = href.trim();
        }
        if (!out.identity_address_uri && isHttp(href) && isGoogleMaps(href)) {
          out.identity_address_uri = href.trim();
          if (!out.identity_address) {
            const t = (a.text || '').trim();
            if (t) out.identity_address = t;
            else {
              const addr = extractGmapsAddress(href);
              if (addr) out.identity_address = addr;
            }
          }
        }
      }
      for (const tb of raw.text_blocks || []) {
        const text = String(tb);
        if (!out.identity_uri_email) {
          const m = text.match(/mailto:[^\s'"<>]+/i);
          if (m) out.identity_uri_email = m[0].trim();
        }
        if (!out.identity_uri_whatsapp) {
          const m = text.match(/(?:whatsapp:[^\s'"<>]+|https?:\/\/(?:wa.me|api.whatsapp.com)[^\s'"<>]+)/i);
          if (m && (!m[0].startsWith('http') || isHttp(m[0]))) {
            out.identity_uri_whatsapp = m[0].trim();
          }
        }
        if (!out.identity_uri_sms) {
          const m = text.match(/sms:[^\s'"<>]+/i);
          if (m) out.identity_uri_sms = m[0].trim();
        }
        if (!out.identity_address_uri) {
          const urlRe = /https?:\/\/[^\s'"<>]+/gi;
          let m;
          while ((m = urlRe.exec(text))) {
            const cand = m[0];
            if (isHttp(cand) && isGoogleMaps(cand)) {
              out.identity_address_uri = cand.trim();
              if (!out.identity_address) {
                const addr = extractGmapsAddress(cand);
                if (addr) out.identity_address = addr;
              }
              break;
            }
          }
        }
      }
    }

    if (!out.service_areas_csv) {
      const areaCandidates = new Set();
      const areaRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
      const ignoreHeadings = /^(home|contact|about|services?|menu|navigation|search)$/i;
      const serviceRe = /(service|repair|install|inspection|quote|booking|clean|maintenance|pool|aircon|fence|paint|build)/i;
      const collect = (text = '') => {
        let m;
        while ((m = areaRe.exec(text))) {
          const token = m[1];
          if (!ignoreHeadings.test(token) && !serviceRe.test(token.toLowerCase())) {
            areaCandidates.add(token);
          }
        }
      };
      for (const h of raw.headings || []) {
        const t = typeof h === 'string' ? h : h?.text || '';
        collect(t);
      }
      for (const a of raw.anchors || []) {
        collect(a.text || '');
      }
      if (areaCandidates.size) {
        out.service_areas_csv = Array.from(areaCandidates).join(',');
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
    const detSocials = det.getSocials(raw);
    for (const [k, v] of Object.entries(detSocials)) {
      if (!out[k] && v.value) out[k] = v.value;
    }
    if (!out.identity_business_name) {
      const v = det.getBusinessName(raw).value;
      if (v) out.identity_business_name = v;
    }
    if (!out.identity_logo_url) {
      const v = det.getLogoUrl(raw).value;
      if (v) out.identity_logo_url = v;
    }
    if (!out.identity_address) {
      const v = det.getAddress(raw).value;
      if (v) out.identity_address = v;
    }
    if (!out.identity_abn) {
      const v = det.getABN(raw).value;
      if (v) out.identity_abn = v;
    }
    if (!out.identity_email) {
      const v = det.getEmail(raw).value;
      if (v) out.identity_email = v.toLowerCase();
    }
    if (!out.identity_phone) {
      const v = det.getPhone(raw).value;
      if (v) out.identity_phone = v;
    }
    if (!out.identity_website_url) {
      const v = det.getDomain(raw).value;
      if (v) out.identity_website_url = v;
    }
    return out;
  },
  detResolve(key, rule, ctx) {
    const raw = ctx?.raw || {};
    let val;
    let confidence = 0;

    if (raw[key] !== undefined && raw[key] !== null) {
      val = raw[key];
    } else if (/^service_[1-3]_/.test(key)) {
      const svc = resolveServicePanels(raw);
      if (svc[key] !== undefined) {
        val = svc[key];
      } else {
        const details = getServiceDetails(raw);
        const match = key.match(/^service_(\d)_(price|price_note|delivery_modes|inclusion_(\d))$/);
        if (details && match) {
          const index = Number(match[1]) - 1;
          if (match[2] === 'price') {
            val = details.prices?.[index];
            confidence = details.priceConfidence?.[index] || 0;
          } else if (match[2] === 'price_note') {
            val = details.priceNotes?.[index];
            confidence = details.priceNoteConfidence?.[index] || 0;
          } else if (match[2] === 'delivery_modes') {
            val = details.deliveryModes?.[index];
            confidence = details.deliveryConfidence?.[index] || 0;
          } else {
            const inclusionIndex = Number(match[3]) - 1;
            const inclusionList = details.inclusions?.[index] || [];
            val = inclusionList[inclusionIndex];
            confidence = details.inclusionConfidence?.[index] || 0;
          }
        }
      }
    } else if (key.startsWith('testimonial_')) {
      const t = resolveTestimonial(raw.testimonials, raw.gmb_lookup?.testimonials);
      const tKey = key.replace(/^testimonial_/, '');
      val = t[tKey];
    } else {
      const fk = fuzzyFindKey(raw, key);
      if (fk !== undefined) val = raw[fk];
    }

    if (val === undefined || val === null) return '';
    const text = String(val).trim();
    if (confidence) return { value: text, confidence };
    return text;

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
  if (v.min_words) {
    const wc = s.split(/\s+/).filter(Boolean).length;
    if (wc < v.min_words) return false;
  }
  if (v.max_words) {
    const wc = s.split(/\s+/).filter(Boolean).length;
    if (wc > v.max_words) return false;
  }
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
  const tradecardCounts = {
    name: !!tradecard?.business?.name,
    website: !!tradecard?.contacts?.website
  };
  trace.push({ stage: 'intent_input', raw_counts: rawCounts, tradecard_counts: tradecardCounts });
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
  add('identity_address', det.getAddress(raw), (v) => det.ADDRESS_RX.test(v));
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
  if (opts.noLLM) trace.push({ stage: 'llm_skipped', reason: 'no_llm_option' });
  const { fields, audit } = await runExecutor({ map, allowSet, raw, tradecard, llm: llmClient, helpers });

  const mvf = await resolveMVF({ raw, tradecard, allowKeys: allowSet });
  const mvfFields = mvf.fields || {};
  const mvfAudit = mvf.audit || [];
  const mvfSupplied = Object.keys(mvfFields).length;
  const mvfMerged = [];
  for (const [k, v] of Object.entries(mvfFields)) {
    if (fields[k]) continue;
    fields[k] = v;
    mvfMerged.push(k);
  }
  if (mvfAudit.length) audit.push(...mvfAudit);
  trace.push({ stage: 'mvf_merge', supplied: mvfSupplied, merged: mvfMerged.length });

  const identity = resolveIdentity(raw);
  const social = resolveSocialLinks(raw.social, raw.gmb_lookup || {});
  deriveFields(fields, { tradecard_url: tradecard?.slug });
  Object.assign(fields, identity, social);

  let proposals = {};
  if (!opts.noLLM) {
    const allowKeys = Array.from(allowSet);
    const unresolvedKeys = allowKeys.filter((k) => (!fields[k] || fields[k] === '') && map[k]);
    trace.push({ stage: 'llm_input', key_count: allowKeys.length, has_raw: !!raw });
    const accepted = [];
    const rejected = [];
    if (unresolvedKeys.length) {
      ({ proposals = {} } = await proposeForUnresolved({ raw, allowKeys, unresolvedKeys, intentMap: map, resolveConfig, fixture: tradecard?.slug, fullRaw: fullFrame }));
      for (const [k, v] of Object.entries(proposals)) {
        const rule = imap.ruleFor(map, k);
        if (!allowSet.has(k)) {
          rejected.push({ key: k, reason: 'not_allowed' });
          logMiss({ key: k, snippet: raw[k], rule, suggestion: v });
          continue;
        }
        if (fields[k] && passesValidation(fields[k], rule)) {
          rejected.push({ key: k, reason: 'already_set' });
          continue;
        }
        if (passesValidation(v, rule)) {
          fields[k] = String(v);
          accepted.push(k);
        } else {
          rejected.push({ key: k, reason: 'failed-validate' });
          logMiss({ key: k, snippet: raw[k], rule, suggestion: v });
        }
      }
    }
    trace.push({ stage: 'llm_merge', proposed: Object.keys(proposals).length, accepted, rejected });
  } else {
    trace.push({ stage: 'llm_merge', skipped: true });
  }
  const remaining = Array.from(allowSet).filter(k => !fields[k]);
  trace.push({ stage: 'unresolved', remaining });
  for (const k of remaining) {
    const rule = imap.ruleFor(map, k);
    logMiss({ key: k, snippet: raw[k], rule, suggestion: proposals[k] });
  }

  trace.push({ stage: 'intent_coverage', before: Object.keys(map).length, after: Object.keys(fields).length, sample_sent: Object.keys(fields).slice(0, 10) });
  return { fields, sent_keys: Object.keys(fields), audit, trace };
};

exports.helpers = helpers;
exports.passesValidation = passesValidation;
