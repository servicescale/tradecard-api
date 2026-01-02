const ABN_RX = /^\d{11}$/;
const BASE_URL = 'https://abr.business.gov.au/json/AbnDetails.aspx';
const MAX_RESULTS = '5';

function normalize(value) {
  return String(value ?? '').trim();
}

function cleanAbn(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return ABN_RX.test(digits) ? digits : '';
}

function parseJsonPayload(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let jsonText = trimmed;
  if (jsonText.startsWith('callback(')) {
    jsonText = jsonText.replace(/^callback\(/, '').replace(/\);?$/, '');
  }
  if (!jsonText.startsWith('{') && jsonText.includes('{')) {
    jsonText = jsonText.slice(jsonText.indexOf('{'), jsonText.lastIndexOf('}') + 1);
  }
  return JSON.parse(jsonText);
}

async function fetchAbrJson(url) {
  try {
    const resp = await fetch(url, { headers: { accept: 'application/json' } });
    if (!resp.ok) return null;
    const text = await resp.text();
    if (!text) return null;
    return parseJsonPayload(text);
  } catch {
    return null;
  }
}

function extractCandidates(payload) {
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
    container.BusinessEntity ||
    container.businessEntity ||
    null;
  if (Array.isArray(names)) return names;
  if (names && typeof names === 'object') return [names];
  const abnValue = payload.Abn || payload.ABN || payload.AbnNumber || payload.AbnIdentifier || payload.abn;
  if (abnValue) return [payload];
  return [];
}

function toLookupResult(candidate) {
  const abn = cleanAbn(candidate?.Abn || candidate?.ABN || candidate?.AbnNumber || candidate?.AbnIdentifier || candidate?.abn);
  if (!abn) return null;
  const entityName = normalize(
    candidate?.EntityName ||
      candidate?.MainName ||
      candidate?.BusinessName ||
      candidate?.TradingName ||
      candidate?.LegalName ||
      candidate?.Name ||
      candidate?.OrganisationName ||
      ''
  );
  const entityType = normalize(
    candidate?.EntityTypeName ||
      candidate?.EntityType ||
      candidate?.EntityTypeCode ||
      candidate?.EntityTypeDescription ||
      ''
  );
  const gstStatus = normalize(
    candidate?.GstStatus ||
      candidate?.GSTStatus ||
      candidate?.GstRegistrationStatus ||
      candidate?.Gst ||
      candidate?.GST ||
      ''
  );
  const state = normalize(candidate?.State || candidate?.StateCode || candidate?.AddressState || '') || undefined;
  return { abn, entityName, entityType, gstStatus, state };
}

async function queryAbrByName(name, state) {
  const url = new URL(BASE_URL);
  url.searchParams.set('guid', process.env.ABR_KEY);
  url.searchParams.set('name', name);
  url.searchParams.set('maxResults', MAX_RESULTS);
  if (state) url.searchParams.set('state', state);
  const payload = await fetchAbrJson(url.toString());
  if (!payload) return null;
  const candidates = extractCandidates(payload);
  for (const candidate of candidates) {
    const result = toLookupResult(candidate);
    if (result) return result;
  }
  return null;
}

async function lookupABN(input) {
  if (!process.env.ABR_KEY) {
    throw new Error('ABR_KEY is not configured');
  }
  const businessName = normalize(input?.businessName);
  if (!businessName) return null;
  const tradingName = normalize(input?.tradingName);
  const state = normalize(input?.state) || null;

  const legalResult = await queryAbrByName(businessName, state);
  if (legalResult) return legalResult;
  if (tradingName) {
    const tradingResult = await queryAbrByName(tradingName, state);
    if (tradingResult) return tradingResult;
  }
  return null;
}

module.exports = { lookupABN };
