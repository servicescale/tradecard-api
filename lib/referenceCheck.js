"use strict";

// Simple reference lookups for validating structured fields.

const countryCodes = new Set(["US", "CA", "GB"]);
const knownIds = new Set(["ID123", "ID456"]);

/**
 * Validate field values against known reference lists.
 * @param {Object} fields key/value pairs to validate
 * @returns {Object} map of field names to error messages
 */
function referenceCheck(fields = {}) {
  const errors = {};
  if (fields.country_code && !countryCodes.has(fields.country_code)) {
    errors.country_code = `Unknown country code: ${fields.country_code}`;
  }
  if (fields.id && !knownIds.has(fields.id)) {
    errors.id = `Unknown id: ${fields.id}`;
  }
  return errors;
}

module.exports = { referenceCheck };
