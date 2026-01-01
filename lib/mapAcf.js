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

  // Prepare service list
  let services = [];
  if (Array.isArray(tc.services)) services = tc.services;
  else if (Array.isArray(tc.services?.list)) services = tc.services.list;
  services = services.filter((s) => s && typeof s === 'object');

  // Identity
  addField(fields, 'identity_business_name', tc.business?.name || tc.identity_business_name, dropped_empty);
  addField(fields, 'identity_owner_name', tc.identity_owner_name || tc.owner?.name, dropped_empty);
  addField(
    fields,
    'identity_role_title',
    tc.identity_role_title || tc.owner?.role || tc.owner?.title,
    dropped_empty
  );
  addField(
    fields,
    'identity_headshot_url',
    tc.identity_headshot_url || tc.owner?.headshot_url || tc.owner?.headshot || tc.assets?.headshot,
    dropped_empty
  );
  addField(
    fields,
    'identity_suburb',
    tc.identity_suburb || tc.business?.address?.suburb || tc.location?.suburb,
    dropped_empty
  );
  addField(
    fields,
    'identity_state',
    tc.identity_state || tc.business?.address?.state || tc.location?.state,
    dropped_empty
  );
  const address =
    tc.identity_address || tc.business?.address?.full || tc.contacts?.address || tc.address?.full;
  addField(fields, 'identity_address', address, dropped_empty);
  addField(
    fields,
    'identity_address_uri',
    tc.identity_address_uri || tc.contacts?.address_uri || tc.address?.uri,
    dropped_empty
  );
  addField(fields, 'identity_abn', tc.identity_abn, dropped_empty);
  addField(fields, 'identity_insured', tc.identity_insured || tc.business?.insured, dropped_empty);
  addField(
    fields,
    'identity_business_type',
    tc.identity_business_type || tc.business?.type,
    dropped_empty
  );
  addField(fields, 'identity_services', services.map((s) => s.title), dropped_empty);
  addField(fields, 'identity_website_url', tc.contacts?.website || tc.identity_website_url, dropped_empty);
  addField(fields, 'identity_website', tc.identity_website || tc.contacts?.website, dropped_empty);


  const email = normalizeEmail(tc.contacts?.emails?.[0] || tc.identity_email);
  if (email) fields.identity_email = email;
  else if (tc.contacts?.emails?.[0] !== undefined || tc.identity_email !== undefined)
    dropped_empty.push('identity_email');

  const phone = normalizePhone(tc.contacts?.phones?.[0] || tc.identity_phone);
  if (phone) fields.identity_phone = phone;
  else if (tc.contacts?.phones?.[0] !== undefined || tc.identity_phone !== undefined)
    dropped_empty.push('identity_phone');

  addField(fields, 'identity_logo_url', tc.assets?.logo || tc.identity_logo_url, dropped_empty);
  addField(
    fields,
    'identity_uri_phone',
    tc.identity_uri_phone || tc.contacts?.uri_phone || (phone ? `tel:${phone}` : undefined),
    dropped_empty
  );
  addField(
    fields,
    'identity_uri_email',
    tc.identity_uri_email || tc.contacts?.uri_email || (email ? `mailto:${email}` : undefined),
    dropped_empty
  );
  addField(
    fields,
    'identity_uri_sms',
    tc.identity_uri_sms || tc.contacts?.uri_sms || (phone ? `sms:${phone}` : undefined),
    dropped_empty
  );
  addField(
    fields,
    'identity_uri_whatsapp',
    tc.identity_uri_whatsapp ||
      tc.contacts?.uri_whatsapp ||
      (phone ? `https://wa.me/${phone.replace(/[^\d]/g, '')}` : undefined),
    dropped_empty
  );

  // Social links
  const socials = Array.isArray(tc.social) ? tc.social : [];
  for (const s of socials) {
    const plat = String(s.platform || '').toLowerCase().trim();
    if (!plat) continue;
    addField(fields, `social_links_${plat}`, s.url, dropped_empty);
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

  // Testimonials
  if (Array.isArray(tc.testimonials)) {
    for (let i = 0; i < Math.min(3, tc.testimonials.length); i++) {
      const t = tc.testimonials[i];
      if (typeof t === 'string') {
        addField(fields, `testimonial_${i + 1}_quote`, t, dropped_empty);
      } else if (t && typeof t === 'object') {
        addField(fields, `testimonial_${i + 1}_quote`, t.quote, dropped_empty);
        addField(fields, `testimonial_${i + 1}_reviewer`, t.reviewer, dropped_empty);
        addField(fields, `testimonial_${i + 1}_location`, t.location, dropped_empty);
        addField(fields, `testimonial_${i + 1}_source`, t.source, dropped_empty);
      }
    addField(fields, `service_${idx}_price_note`, svc.price_note, dropped_empty);
    addField(fields, `service_${idx}_delivery_modes`, svc.delivery_modes, dropped_empty);
    if (Array.isArray(svc.inclusions)) {
      for (let j = 0; j < 3; j++) {
        addField(fields, `service_${idx}_inclusion_${j + 1}`, svc.inclusions[j], dropped_empty);
      }
    } else {
      addField(fields, `service_${idx}_inclusion_1`, svc.inclusion_1, dropped_empty);
      addField(fields, `service_${idx}_inclusion_2`, svc.inclusion_2, dropped_empty);
      addField(fields, `service_${idx}_inclusion_3`, svc.inclusion_3, dropped_empty);
    }
    addField(fields, `service_${idx}_tags`, svc.tags, dropped_empty);
    addField(fields, `service_${idx}_video_url`, svc.video_url, dropped_empty);
    addField(fields, `service_${idx}_price`, svc.price, dropped_empty);
    addField(fields, `service_${idx}_panel_tag`, svc.panel_tag, dropped_empty);
  }

  // Testimonial
  const testimonialObj =
    (tc.testimonial && typeof tc.testimonial === 'object' && tc.testimonial) ||
    (Array.isArray(tc.testimonials)
      ? tc.testimonials.find((t) => t && typeof t === 'object')
      : null);
  const testimonialQuote =
    tc.testimonial_quote ||
    testimonialObj?.quote ||
    testimonialObj?.text ||
    (Array.isArray(tc.testimonials) && typeof tc.testimonials[0] === 'string'
      ? tc.testimonials[0]
      : undefined);
  addField(fields, 'testimonial_quote', testimonialQuote, dropped_empty);
  addField(
    fields,
    'testimonial_reviewer',
    tc.testimonial_reviewer || testimonialObj?.reviewer || testimonialObj?.name,
    dropped_empty
  );
  addField(
    fields,
    'testimonial_location',
    tc.testimonial_location || testimonialObj?.location,
    dropped_empty
  );
  addField(
    fields,
    'testimonial_source_label',
    tc.testimonial_source_label || testimonialObj?.source_label,
    dropped_empty
  );
  addField(
    fields,
    'testimonial_source_url',
    tc.testimonial_source_url || testimonialObj?.source_url,
    dropped_empty
  );
  addField(
    fields,
    'testimonial_job_type',
    tc.testimonial_job_type || testimonialObj?.job_type,
    dropped_empty
  );

  // Theme fields

  addField(fields, 'theme_tone', tc.brand?.tone, dropped_empty);
  if (Array.isArray(tc.brand?.colors)) {
    addField(fields, 'theme_colors', tc.brand.colors, dropped_empty);
  }
  addField(fields, 'theme_primary_color', tc.theme?.primary_color, dropped_empty);
  addField(fields, 'theme_accent_color', tc.theme?.accent_color, dropped_empty);

  addField(
    fields,
    'theme_primary_color',
    tc.theme_primary_color || tc.theme?.primary_color || tc.brand?.primary_color,
    dropped_empty
  );
  addField(
    fields,
    'theme_accent_color',
    tc.theme_accent_color || tc.theme?.accent_color || tc.brand?.accent_color,
    dropped_empty
  );


  // Trust fields
  for (const [k, v] of Object.entries(tc)) {
    if (k.startsWith('trust_')) addField(fields, k, v, dropped_empty);
  }
  if (Array.isArray(tc.trust)) {
    for (let i = 0; i < Math.min(5, tc.trust.length); i++) {
      addField(fields, `trust_${i + 1}`, tc.trust[i], dropped_empty);
    }
  } else if (tc.trust && typeof tc.trust === 'object') {
    for (const [k, v] of Object.entries(tc.trust)) {
      addField(fields, `trust_${k}`, v, dropped_empty);
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
