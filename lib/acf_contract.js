// lib/acf_contract.js
// Provides allowlist keys for ACF fields used during intent resolution.

let cached;

function expandServiceWildcards(list = []) {
  const out = [];
  for (const key of list) {
    const m = key.match(/^service_\*_(.+)$/);
    if (m) {
      for (let i = 1; i <= 3; i++) out.push(`service_${i}_${m[1]}`);
    } else {
      out.push(key);
    }
  }
  return out;
}

// Fallback allowlist used when the remote endpoint is unavailable.
const FALLBACK = (() => {
  const identityFields = [
    'business_name',
    'website_url',
    'email',
    'phone',
    'logo_url',
    'address',
    'state',
    'suburb',
    'abn',
    'owner_name',
    'role_title',
    'headshot_url',
    'website',
    'location_label',
    'services',
    'uri_phone',
    'uri_email',
    'uri_sms',
    'uri_whatsapp',
    'address_uri'
  ];

  const socialPlatforms = [
    'facebook',
    'instagram',
    'linkedin',
    'twitter',
    'youtube',
    'tiktok',
    'pinterest'
  ];

  const testimonialFields = [
    'quote',
    'reviewer',
    'location',
    'source_label',
    'source_url',
    'job_type'
  ];

  const trustFields = [
    'qr_text',
    'google_rating',
    'google_review_count',
    'google_review_url',
    'review_button_link',
    'profile_video_url',
    'contact_form',
    'vcf_url'
  ];

  const themeFields = ['primary_color', 'accent_color'];

  const serviceFields = [
    'title',
    'subtitle',
    'description',
    'image_url',
    'price',
    'price_note',
    'cta_label',
    'cta_link',
    'delivery_modes',
    'inclusion_1',
    'inclusion_2',
    'inclusion_3',
    'video_url',
    'tags',
    'service_tags',
    'panel_tag'
  ];

  const services = [];
  for (let i = 1; i <= 3; i++) {
    for (const f of serviceFields) services.push(`service_${i}_${f}`);
  }

  return [
    ...identityFields.map((f) => `identity_${f}`),
    ...socialPlatforms.map((p) => `social_links_${p}`),
    'business_description',
    'service_areas_csv',
    ...testimonialFields.map((f) => `testimonial_${f}`),
    ...trustFields.map((f) => `trust_${f}`),
    ...themeFields.map((f) => `theme_${f}`),
    ...services
  ];
})();

async function fetchRemoteAllowlist() {
  const url = process.env.ACF_CONTRACT_URL;
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let list;
    if (Array.isArray(data)) list = data;
    else if (Array.isArray(data?.fields)) list = data.fields;
    else list = [];
    return expandServiceWildcards(list);
  } catch {
    return null;
  }
}

async function getAllowKeys() {
  if (cached) return cached;
  const remote = await fetchRemoteAllowlist();
  cached = Array.isArray(remote) && remote.length ? remote : FALLBACK;
  return cached;
}

module.exports = { getAllowKeys };

