function nonEmpty(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string') return val.trim() !== '';
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

function addField(out, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    const arr = value
      .map(v => (typeof v === 'string' ? v.trim() : v))
      .filter(v => nonEmpty(v));
    if (!arr.length) return;
    value = arr.join(', ');
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
  return phone.replace(/\D/g, '');
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
    const areas = [...new Set(tc.service_areas.map(a => (typeof a === 'string' ? a.trim() : a)).filter(nonEmpty))];
    if (areas.length) fields.service_areas_csv = areas.join(', ');
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
    addField(fields, `service_${idx}_price`, svc.price);
    addField(fields, `service_${idx}_price_note`, svc.price_note);
    addField(fields, `service_${idx}_cta_label`, svc.cta_label);
    addField(fields, `service_${idx}_cta_link`, svc.cta_link);
    addField(fields, `service_${idx}_delivery_modes`, svc.delivery_modes);
    if (Array.isArray(svc.inclusions)) {
      addField(fields, `service_${idx}_inclusion_1`, svc.inclusions[0]);
      addField(fields, `service_${idx}_inclusion_2`, svc.inclusions[1]);
      addField(fields, `service_${idx}_inclusion_3`, svc.inclusions[2]);
    } else {
      addField(fields, `service_${idx}_inclusion_1`, svc.inclusion_1);
      addField(fields, `service_${idx}_inclusion_2`, svc.inclusion_2);
      addField(fields, `service_${idx}_inclusion_3`, svc.inclusion_3);
    }
    addField(fields, `service_${idx}_video_url`, svc.video_url);
    addField(fields, `service_${idx}_tags`, svc.tags);
  }

  return { fields, keys: Object.keys(fields) };
}

module.exports = { mapTradecardToAcf };
