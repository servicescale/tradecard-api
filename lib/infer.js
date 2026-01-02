// lib/infer.js
// Two-stage, schema-safe LLM inference for business profiles.

const { Logger } = require('./logger');

const MODEL = 'gpt-4o-mini';

function emptyProfile() {
  return {
    identity_business_name: null,
    identity_business_description: null,
    identity_services: [],
    service_areas: [],
    identity_value_proposition: null
  };
}

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function hasExactKeys(obj, keys) {
  if (!isPlainObject(obj)) return false;
  const objKeys = Object.keys(obj);
  if (objKeys.length !== keys.length) return false;
  return objKeys.every((k) => keys.includes(k));
}

function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const item of arr) {
    if (typeof item !== 'string') return null;
    const trimmed = item.trim();
    if (!trimmed) return null;
    out.push(trimmed);
  }
  return out;
}

function normalizeNullableString(value) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEvidenceBundle(obj) {
  if (!hasExactKeys(obj, ['service_evidence', 'about_evidence', 'geo_evidence', 'contact_evidence'])) return null;

  if (!Array.isArray(obj.service_evidence)) return null;
  const serviceEvidence = [];
  for (const entry of obj.service_evidence) {
    if (!hasExactKeys(entry, ['phrases', 'occurrences', 'pages'])) return null;
    const phrases = normalizeStringArray(entry.phrases);
    const pages = normalizeStringArray(entry.pages);
    const occurrences = Number(entry.occurrences);
    if (!phrases || !pages || !Number.isFinite(occurrences)) return null;
    serviceEvidence.push({ phrases, occurrences, pages });
  }

  const aboutEvidence = normalizeStringArray(obj.about_evidence);
  const geoEvidence = normalizeStringArray(obj.geo_evidence);
  if (!aboutEvidence || !geoEvidence) return null;

  if (!hasExactKeys(obj.contact_evidence, ['emails', 'phones'])) return null;
  const emails = normalizeStringArray(obj.contact_evidence.emails);
  const phones = normalizeStringArray(obj.contact_evidence.phones);
  if (!emails || !phones) return null;

  return {
    service_evidence: serviceEvidence,
    about_evidence: aboutEvidence,
    geo_evidence: geoEvidence,
    contact_evidence: { emails, phones }
  };
}

function normalizeProfile(obj) {
  if (!hasExactKeys(obj, [
    'identity_business_name',
    'identity_business_description',
    'identity_services',
    'service_areas',
    'identity_value_proposition'
  ])) return null;

  const name = normalizeNullableString(obj.identity_business_name);
  const description = normalizeNullableString(obj.identity_business_description);
  const valueProp = normalizeNullableString(obj.identity_value_proposition);
  if (name === undefined || description === undefined || valueProp === undefined) return null;

  if (!Array.isArray(obj.identity_services)) return null;
  const services = [];
  for (const svc of obj.identity_services) {
    if (!hasExactKeys(svc, ['name', 'description'])) return null;
    if (typeof svc.name !== 'string' || !svc.name.trim()) return null;
    const svcDescription = normalizeNullableString(svc.description);
    if (svcDescription === undefined) return null;
    services.push({ name: svc.name.trim(), description: svcDescription });
  }

  const serviceAreas = normalizeStringArray(obj.service_areas);
  if (!serviceAreas) return null;

  return {
    identity_business_name: name,
    identity_business_description: description,
    identity_services: services,
    service_areas: serviceAreas,
    identity_value_proposition: valueProp
  };
}

function normalizeText(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function filterServicesByEvidence(profile, evidence) {
  const allowed = new Set();
  for (const entry of evidence.service_evidence || []) {
    const multiSignal = entry.occurrences >= 2 || entry.pages.length >= 2 || entry.phrases.length >= 2;
    if (!multiSignal) continue;
    for (const phrase of entry.phrases) {
      allowed.add(normalizeText(phrase));
    }
  }
  return profile.identity_services.filter((svc) => allowed.has(normalizeText(svc.name)));
}

function filterServiceAreasByEvidence(profile, evidence) {
  const allowed = new Set((evidence.geo_evidence || []).map((v) => normalizeText(v)));
  return profile.service_areas.filter((area) => allowed.has(normalizeText(area)));
}

async function callOpenAI(apiKey, requestBody) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    Logger.debug('LLM', 'OpenAI request', { endpoint: 'chat_completions', body: requestBody });
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const data = await res.json().catch((err) => ({ parse_error: err.message }));
    Logger.debug('LLM', 'OpenAI response', { endpoint: 'chat_completions', status: res.status, ok: res.ok, data });
    return { res, data };
  } catch (err) {
    Logger.debug('LLM', 'OpenAI request failed', { endpoint: 'chat_completions', error: err.message || String(err) });
    return { res: null, data: { error: err.message || String(err) } };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(content) {
  if (!content || typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function buildEvidencePayload(raw = {}, tradecard = {}) {
  return {
    url: raw.url || tradecard?.contacts?.website || null,
    headings: (raw.headings || []).slice(0, 80),
    text_blocks: (raw.text_blocks || []).slice(0, 120),
    anchors: (raw.anchors || []).slice(0, 80).map((a) => ({ href: a.href || '', text: a.text || '' })),
    meta: raw.meta || {},
    jsonld: raw.jsonld || [],
    service_panels: Array.isArray(raw.service_panels) ? raw.service_panels.slice(0, 20) : [],
    projects: Array.isArray(raw.projects) ? raw.projects.slice(0, 20) : [],
    contact_form_links: Array.isArray(raw.contact_form_links) ? raw.contact_form_links.slice(0, 20) : []
  };
}

function buildIdentityFacts({ tradecard = {}, raw = {}, identity = {} } = {}) {
  const email = identity.email || tradecard?.contacts?.emails?.[0] || null;
  const phone = identity.phone || tradecard?.contacts?.phones?.[0] || null;
  const website = identity.website || tradecard?.contacts?.website || raw.url || null;
  const state = identity.state || raw.identity_state || tradecard?.business?.address?.state || null;
  const abn = identity.abn_source === 'abr' ? identity.abn : null;
  return {
    email: email || null,
    phone: phone || null,
    website: website || null,
    state: state || null,
    abn: abn || null
  };
}

async function inferTradecard({ tradecard = {}, raw = {}, identity = {}, disabled = false } = {}) {
  const baseProfile = emptyProfile();
  if (disabled) return { profile: baseProfile, evidence: null, _meta: { skipped: 'no_llm' } };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { profile: baseProfile, evidence: null, _meta: { skipped: 'no_api_key' } };

  const evidencePayload = buildEvidencePayload(raw, tradecard);
  const stage1Body = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: [
          'You are an evidence extractor. Use ONLY the provided scrape data.',
          'Group phrases that clearly describe the same service. Omit weak or unclear evidence.',
          'Do NOT normalize into final answers.',
          'Return ONLY valid JSON matching this schema:',
          '{"service_evidence":[{"phrases":[string],"occurrences":number,"pages":[string]}],"about_evidence":[string],"geo_evidence":[string],"contact_evidence":{"emails":[string],"phones":[string]}}.',
          'Use empty arrays when no evidence is available.'
        ].join(' ')
      },
      { role: 'user', content: JSON.stringify(evidencePayload) }
    ],
    temperature: 0,
    max_tokens: 900,
    response_format: { type: 'json_object' }
  };

  const stage1Start = Date.now();
  const stage1 = await callOpenAI(apiKey, stage1Body);
  const stage1Ms = Date.now() - stage1Start;
  const stage1Content = stage1.data?.choices?.[0]?.message?.content;
  Logger.debug('LLM', 'Evidence response content', { content: stage1Content });
  if (!stage1.res?.ok || !stage1Content) {
    return { profile: baseProfile, evidence: null, _meta: { error: 'evidence_request_failed', stage1_ms: stage1Ms } };
  }
  const parsedEvidence = parseJson(stage1Content);
  const evidence = parsedEvidence ? normalizeEvidenceBundle(parsedEvidence) : null;
  if (!evidence) {
    return { profile: baseProfile, evidence: null, _meta: { error: 'invalid_evidence', stage1_ms: stage1Ms } };
  }

  const identityFacts = buildIdentityFacts({ tradecard, raw, identity });
  const stage2Body = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: [
          'You are a composer. Use ONLY the provided evidence bundle and identity facts.',
          'Do NOT invent services, claims, or locations. Use neutral, factual language.',
          'If evidence is insufficient, return null for that field.',
          'Do NOT add or remove keys. Return ONLY valid JSON matching this schema:',
          '{"identity_business_name":string|null,"identity_business_description":string|null,"identity_services":[{"name":string,"description":string|null}],"service_areas":[string],"identity_value_proposition":string|null}.'
        ].join(' ')
      },
      { role: 'user', content: JSON.stringify({ evidence, identity_facts: identityFacts }) }
    ],
    temperature: 0,
    max_tokens: 900,
    response_format: { type: 'json_object' }
  };

  const stage2Start = Date.now();
  const stage2 = await callOpenAI(apiKey, stage2Body);
  const stage2Ms = Date.now() - stage2Start;
  const stage2Content = stage2.data?.choices?.[0]?.message?.content;
  Logger.debug('LLM', 'Composition response content', { content: stage2Content });
  if (!stage2.res?.ok || !stage2Content) {
    return { profile: baseProfile, evidence: null, _meta: { error: 'profile_request_failed', stage2_ms: stage2Ms } };
  }
  const parsedProfile = parseJson(stage2Content);
  const profile = parsedProfile ? normalizeProfile(parsedProfile) : null;
  if (!profile) {
    return { profile: baseProfile, evidence: null, _meta: { error: 'invalid_profile', stage2_ms: stage2Ms } };
  }

  const filteredProfile = {
    ...profile,
    identity_services: filterServicesByEvidence(profile, evidence),
    service_areas: filterServiceAreasByEvidence(profile, evidence)
  };

  return {
    profile: filteredProfile,
    evidence,
    _meta: { ok: true, stage1_ms: stage1Ms, stage2_ms: stage2Ms }
  };
}

module.exports = { inferTradecard, emptyProfile };
