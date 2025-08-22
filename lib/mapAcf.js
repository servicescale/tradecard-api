function addField(out, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    const arr = value
      .map(v => (typeof v === 'string' ? v.trim() : v))
      .filter(v => v);
    if (arr.length === 0) return;
    value = arr.join(',');
  } else if (typeof value === 'string') {
    value = value.trim();
    if (!value) return;
  }
  out[key] = value;
}

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.replace(/[^+\d]/g, '');
}

function mapTradecardToAcf(tc = {}) {
  const fields = {};

  addField(fields, 'identity_business_name', tc.business?.name);
  addField(fields, 'identity_website_url', tc.contacts?.website);

  const email = normalizeEmail(tc.contacts?.emails?.[0]);
  if (email) fields.identity_email = email;

  const phone = normalizePhone(tc.contacts?.phones?.[0]);
  if (phone) fields.identity_phone = phone;

  addField(fields, 'identity_logo_url', tc.assets?.logo);

  const socials = Array.isArray(tc.social) ? tc.social : [];
  const platforms = ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiktok'];
  for (const plat of platforms) {
    const item = socials.find(s => s.platform === plat);
    addField(fields, `social_links_${plat}`, item?.url);
  }

  addField(fields, 'business_description', tc.business?.description);

  if (Array.isArray(tc.service_areas)) {
    addField(
      fields,
      'service_areas_csv',
      tc.service_areas.map(a => (typeof a === 'string' ? a.trim() : a))
    );
  }

  let services = [];
  if (Array.isArray(tc.services)) services = tc.services;
  else if (Array.isArray(tc.services?.list)) services = tc.services.list;
  services = services.filter(s => s && typeof s === 'object');

  for (let i = 0; i < Math.min(3, services.length); i++) {
    const svc = services[i] || {};
    const idx = i + 1;
    addField(fields, `service_${idx}_title`, svc.title);
    addField(fields, `service_${idx}_subtitle`, svc.subtitle);
    addField(fields, `service_${idx}_description`, svc.description);
    addField(fields, `service_${idx}_image_url`, svc.image_url || svc.image);
    addField(fields, `service_${idx}_cta_label`, svc.cta_label);
    addField(fields, `service_${idx}_cta_link`, svc.cta_link);
  }

  return fields;
}

module.exports = { mapTradecardToAcf };
