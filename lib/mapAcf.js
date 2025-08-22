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
    addField(fields, 'service_areas_csv', tc.service_areas);
  }

  const services = Array.isArray(tc.services?.list) ? tc.services.list : [];
  for (let i = 0; i < Math.min(3, services.length); i++) {
    const svc = services[i];
    const prefix = `service_${i + 1}_`;
    if (typeof svc === 'string') {
      addField(fields, `${prefix}title`, svc);
      continue;
    }
    if (!svc || typeof svc !== 'object') continue;
    const {
      title,
      name,
      subtitle,
      description,
      image_url,
      price,
      price_note,
      cta_label,
      cta_link,
      delivery_modes,
      video_url,
      tags
    } = svc;
    addField(fields, `${prefix}title`, title || name);
    addField(fields, `${prefix}subtitle`, subtitle);
    addField(fields, `${prefix}description`, description);
    addField(fields, `${prefix}image_url`, image_url);
    addField(fields, `${prefix}price`, price);
    addField(fields, `${prefix}price_note`, price_note);
    addField(fields, `${prefix}cta_label`, cta_label);
    addField(fields, `${prefix}cta_link`, cta_link);
    addField(fields, `${prefix}delivery_modes`, delivery_modes);
    for (let j = 1; j <= 3; j++) {
      const inc = svc[`inclusion_${j}`] || (Array.isArray(svc.inclusions) ? svc.inclusions[j - 1] : undefined);
      addField(fields, `${prefix}inclusion_${j}`, inc);
    }
    addField(fields, `${prefix}video_url`, video_url);
    addField(fields, `${prefix}tags`, tags);
  }

  return fields;
}

module.exports = { mapTradecardToAcf };
