const { similar } = require('../lib/resolve');
const { Logger } = require('../lib/logger');

const ABN_DIGITS_RX = /^\d{11}$/;
const MAX_RESULTS = 5;
const BASE_URL = 'https://abr.business.gov.au/json';

function cleanAbn(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return ABN_DIGITS_RX.test(digits) ? digits : '';
}

function normalizeName(value) {
  return String(value || '').trim();
}

function extractNames(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const container =
    payload.ABRSearchByNameAdvancedSimpleProtocolResult ||
    payload.ABRSearchByNameAdvancedResult ||
    payload.ABRSearchByNameResult ||
    payload;
  const names =
    container.Names ||
    container.names ||
    container.SearchResults ||
    container.searchResults ||
    container.Results ||
    container.results ||
    [];
  return Array.isArray(names) ? names : [];
}

async function fetchAbrJson(url) {
  const resp = await fetch(url, { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`ABR HTTP ${resp.status}`);
  const text = (await resp.text()).trim();
  if (!text) return {};
  let jsonText = text;
  if (!jsonText.startsWith('{') && jsonText.includes('{')) {
    jsonText = jsonText.slice(jsonText.indexOf('{'), jsonText.lastIndexOf('}') + 1);
  }
  if (jsonText.startsWith('callback(')) {
    jsonText = jsonText.replace(/^callback\(/, '').replace(/\);?$/, '');
  }
  return JSON.parse(jsonText);
}

function scoreCandidate(candidate, { businessName, tradingName, state }) {
  const name = normalizeName(candidate.Name || candidate.EntityName || candidate.BusinessName || candidate.TradingName || candidate.LegalName);
  const nameType = normalizeName(candidate.NameType || candidate.NameTypeDescription || candidate.EntityTypeName || '');
  const candidateState = normalizeName(candidate.State || candidate.StateCode || candidate.AddressState || '');
  const legalScore = businessName ? similar(businessName, name) : 0;
  const tradingScore = tradingName ? similar(tradingName, name) : 0;
  let score = Math.max(legalScore, tradingScore);
  if (legalScore >= tradingScore && legalScore > 0) score += 0.05;
  if (/legal|entity/i.test(nameType)) score += 0.15;
  if (/trading/i.test(nameType)) score += 0.1;
  if (state && candidateState && state.toUpperCase() === candidateState.toUpperCase()) score += 0.02;
  return { score, name, candidateState };
}

function pickEntityName(details, fallback) {
  if (!details || typeof details !== 'object') return fallback;
  const name =
    details.EntityName ||
    details.MainName ||
    details.BusinessName ||
    details.Name ||
    details.OrganisationName ||
    fallback;
  return normalizeName(name);
}

function pickEntityType(details, fallback) {
  if (!details || typeof details !== 'object') return fallback;
  return normalizeName(details.EntityTypeName || details.EntityType || details.EntityTypeCode || fallback || '');
}

function pickGstStatus(details, fallback) {
  if (!details || typeof details !== 'object') return fallback;
  const gst =
    details.GstStatus ||
    details.GSTStatus ||
    details.Gst ||
    details.GST ||
    details.GstRegistrationStatus ||
    fallback ||
    '';
  return normalizeName(typeof gst === 'string' ? gst : gst?.status || gst?.GstStatus || '');
}

async function lookupABN(input) {
  try {
    const guid = process.env.ABR_GUID;
    if (!guid) {
      Logger.warn('ABR', 'ABR_GUID missing, skipping ABN lookup');
      return null;
    }
    const businessName = normalizeName(input?.businessName);
    if (!businessName) return null;
    const tradingName = normalizeName(input?.tradingName);
    const state = normalizeName(input?.state);

    const searchUrl = new URL(`${BASE_URL}/MatchingNames.aspx`);
    searchUrl.searchParams.set('name', businessName);
    searchUrl.searchParams.set('maxResults', String(MAX_RESULTS));
    searchUrl.searchParams.set('guid', guid);

    const data = await fetchAbrJson(searchUrl.toString());
    const names = extractNames(data).slice(0, MAX_RESULTS);
    const candidates = names
      .map((candidate) => {
        const abn = cleanAbn(candidate.Abn || candidate.ABN || candidate.AbnNumber || candidate.AbnIdentifier);
        if (!abn) return null;
        const { score, name, candidateState } = scoreCandidate(candidate, { businessName, tradingName, state });
        return {
          abn,
          name,
          nameType: normalizeName(candidate.NameType || candidate.NameTypeDescription || ''),
          score,
          state: candidateState || normalizeName(candidate.State || candidate.StateCode || '') || undefined,
          entityType: normalizeName(candidate.EntityTypeName || '')
        };
      })
      .filter(Boolean);

    if (!candidates.length) return null;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 0.6) return null;

    let details = null;
    try {
      const detailsUrl = new URL(`${BASE_URL}/AbnDetails.aspx`);
      detailsUrl.searchParams.set('abn', best.abn);
      detailsUrl.searchParams.set('guid', guid);
      details = await fetchAbrJson(detailsUrl.toString());
    } catch {
      details = null;
    }

    return {
      abn: best.abn,
      entityName: pickEntityName(details, best.name),
      entityType: pickEntityType(details, best.entityType),
      gstStatus: pickGstStatus(details, ''),
      state: best.state
    };
  } catch (err) {
    Logger.warn('ABR', 'ABR lookup failed', { message: err.message || String(err) });
    return null;
  }
}

module.exports = { lookupABN };
