const REQUIRED_ACF_KEYS = [
  'identity_business_name',
  'identity_owner_name',
  'identity_phone',
  'identity_email',
  'identity_state',
  'identity_role_title',
  'identity_business_type',
  'identity_website',
  'identity_location_label',
  'service_1_title'
];

function resolveGate({ coverage, requiredPresent, threshold }) {
  if (!requiredPresent) return { pass: false, reason: 'missing_required' };
  if (coverage < threshold) return { pass: false, reason: 'insufficient_coverage' };
  return { pass: true };
}

function publishGate({ resolvePass, requiredMissing }) {
  if (!resolvePass) return { pass: false, reason: 'resolve_failed' };
  if (requiredMissing && requiredMissing.length) return { pass: false, reason: 'missing_required' };
  return { pass: true };
}

module.exports = { resolveGate, publishGate, REQUIRED_ACF_KEYS };
