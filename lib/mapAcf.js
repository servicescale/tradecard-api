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

  return fields;
}

module.exports = { mapTradecardToAcf };
