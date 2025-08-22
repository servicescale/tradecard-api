const allowedPatterns = [
  /^identity_.+/, // identity_* fields
  /^social_links_.+/, // social_links_* fields
  /^service_[1-3]_.+/, // service_{1..3}_* fields
  /^business_description$/, // business_description
  /^service_areas_csv$/, // service_areas_csv
  /^testimonial_.+/, // testimonial_* fields
  /^theme_.+/, // theme_* fields
  /^trust_.+/ // trust_* fields
];

const isAllowedKey = (key) => allowedPatterns.some((re) => re.test(key));

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.replace(/[^+\d]/g, '');
}

function addField(out, key, value, droppedEmpty) {
  if (value === undefined || value === null) {
    droppedEmpty.push(key);
    return;
  }
  if (Array.isArray(value)) {
    const arr = value
      .map((v) => {
        if (typeof v === 'number') return String(v);
        if (typeof v === 'string') return v.trim();
        return String(v || '');
      })
      .filter((v) => v);
    if (arr.length === 0) {
      droppedEmpty.push(key);
      return;
    }
    value = arr.join(',');
  } else if (typeof value === 'number') {
    value = String(value);
  } else if (typeof value === 'string') {
    value = value.trim();
    if (!value) {
      droppedEmpty.push(key);
      return;
    }
  } else {
    value = String(value).trim();
    if (!value) {
      droppedEmpty.push(key);
      return;
    }
  }

  if (key.includes('phone')) value = normalizePhone(value);
  if (key.includes('email')) value = normalizeEmail(value);

  out[key] = value;
}

function mapTradecardToAcf(tc = {}) {
  const fields = {};
  const dropped_unknown = [];
  const dropped_empty = [];

  // Identity
  addField(fields, 'identity_business_name', tc.business?.name, dropped_empty);
  addField(fields, 'identity_website_url', tc.contacts?.website, dropped_empty);

  const email = normalizeEmail(tc.contacts?.emails?.[0]);
  if (email) fields.identity_email = email; else if (tc.contacts?.emails?.[0] !== undefined) dropped_empty.push('identity_email');

  const phone = normalizePhone(tc.contacts?.phones?.[0]);
  if (phone) fields.identity_phone = phone; else if (tc.contacts?.phones?.[0] !== undefined) dropped_empty.push('identity_phone');

  addField(fields, 'identity_logo_url', tc.assets?.logo, dropped_empty);

  // Social links
  const socials = Array.isArray(tc.social) ? tc.social : [];
  const platforms = ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiktok'];
  for (const plat of platforms) {
    const item = socials.find((s) => s.platform === plat);
    addField(fields, `social_links_${plat}`, item?.url, dropped_empty);
  }

  // Business description
  addField(fields, 'business_description', tc.business?.description, dropped_empty);

  // Service areas
  if (Array.isArray(tc.service_areas)) {
    addField(
      fields,
      'service_areas_csv',
      tc.service_areas.map((a) => (typeof a === 'string' ? a.trim() : a)),
      dropped_empty
    );
  }

  // Services
  let services = [];
  if (Array.isArray(tc.services)) services = tc.services;
  else if (Array.isArray(tc.services?.list)) services = tc.services.list;
  services = services.filter((s) => s && typeof s === 'object');

  for (let i = 0; i < Math.min(3, services.length); i++) {
    const svc = services[i] || {};
    const idx = i + 1;
    addField(fields, `service_${idx}_title`, svc.title, dropped_empty);
    addField(fields, `service_${idx}_subtitle`, svc.subtitle, dropped_empty);
    addField(fields, `service_${idx}_description`, svc.description, dropped_empty);
    addField(fields, `service_${idx}_image_url`, svc.image_url || svc.image, dropped_empty);
    addField(fields, `service_${idx}_cta_label`, svc.cta_label, dropped_empty);
    addField(fields, `service_${idx}_cta_link`, svc.cta_link, dropped_empty);
  }

  // Testimonials (if array of strings)
  if (Array.isArray(tc.testimonials)) {
    const testi = tc.testimonials.filter(Boolean);
    for (let i = 0; i < Math.min(3, testi.length); i++) {
      addField(fields, `testimonial_${i + 1}_quote`, testi[i], dropped_empty);
    }
  }

  // Theme fields
  addField(fields, 'theme_tone', tc.brand?.tone, dropped_empty);
  if (Array.isArray(tc.brand?.colors)) {
    addField(fields, 'theme_colors', tc.brand.colors, dropped_empty);
  }

  // Trust fields (if present as object or array)
  if (Array.isArray(tc.trust)) {
    for (let i = 0; i < Math.min(5, tc.trust.length); i++) {
      addField(fields, `trust_${i + 1}`, tc.trust[i], dropped_empty);
    }
  } else if (tc.trust && typeof tc.trust === 'object') {
    for (const [k, v] of Object.entries(tc.trust)) {
      const key = `trust_${k}`;
      addField(fields, key, v, dropped_empty);
    }
  }

  // Additional custom fields provided under tc.acf or tc.wp_acf
  const extra = (tc.acf || tc.wp_acf || tc.wpFields || {});
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (isAllowedKey(k)) addField(fields, k, v, dropped_empty);
      else dropped_unknown.push(k);
    }
  }

  return { fields, dropped_unknown, dropped_empty };
}

module.exports = { mapTradecardToAcf };
