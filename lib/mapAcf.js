function nonEmpty(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string') return val.trim() !== '';
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

function mapAcf(tc = {}) {
  const fields = {};

  const identity = {
    identity_business_name: tc.business?.name,
    identity_website_url: tc.contacts?.website,
    identity_email: tc.contacts?.emails?.[0],
    identity_phone: tc.contacts?.phones?.[0],
    identity_logo_url: tc.assets?.logo
  };
  for (const [k, v] of Object.entries(identity)) {
    if (nonEmpty(v)) fields[k] = v;
  }

  const socials = tc.social || [];
  const platforms = ['facebook','instagram','linkedin','twitter','youtube','tiktok'];
  for (const plat of platforms) {
    const item = socials.find(s => s.platform === plat);
    if (item && nonEmpty(item.url)) fields[`social_links_${plat}`] = item.url;
  }

  const services = Array.isArray(tc.services?.list) ? tc.services.list : [];
  for (let i = 0; i < Math.min(3, services.length); i++) {
    const svc = services[i];
    const prefix = `services_${i + 1}_`;
    if (typeof svc === 'string') {
      if (nonEmpty(svc)) fields[`${prefix}title`] = svc;
      continue;
    }
    if (!svc || typeof svc !== 'object') continue;
    const { title, name, subtitle, description, image_url, price, price_note, cta_label, cta_link, video_url } = svc;
    const deliver = svc.delivery_modes;
    const inclusions = svc.inclusions || [];
    const tags = svc.tags;

    if (nonEmpty(title || name)) fields[`${prefix}title`] = title || name;
    if (nonEmpty(subtitle)) fields[`${prefix}subtitle`] = subtitle;
    if (nonEmpty(description)) fields[`${prefix}description`] = description;
    if (nonEmpty(image_url)) fields[`${prefix}image_url`] = image_url;
    if (nonEmpty(price)) fields[`${prefix}price`] = price;
    if (nonEmpty(price_note)) fields[`${prefix}price_note`] = price_note;
    if (nonEmpty(cta_label)) fields[`${prefix}cta_label`] = cta_label;
    if (nonEmpty(cta_link)) fields[`${prefix}cta_link`] = cta_link;
    if (nonEmpty(deliver)) {
      const val = Array.isArray(deliver) ? deliver.join(', ') : deliver;
      if (nonEmpty(val)) fields[`${prefix}delivery_modes`] = val;
    }
    for (let j = 1; j <= 3; j++) {
      const inc = svc[`inclusion_${j}`] || inclusions[j - 1];
      if (nonEmpty(inc)) fields[`${prefix}inclusion_${j}`] = inc;
    }
    if (nonEmpty(video_url)) fields[`${prefix}video_url`] = video_url;
    if (nonEmpty(tags)) {
      const val = Array.isArray(tags) ? tags.join(', ') : tags;
      if (nonEmpty(val)) fields[`${prefix}tags`] = val;
    }
  }

  return fields;
}

module.exports = { mapAcf };
