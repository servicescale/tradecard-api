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
[1, 2, 3].forEach((i) => {
  serviceFields.forEach((f) => services.push(`service_${i}_${f}`));
});

const acfContract = [
  ...identityFields.map((f) => `identity_${f}`),
  ...socialPlatforms.map((p) => `social_links_${p}`),
  'business_description',
  'service_areas_csv',
  ...testimonialFields.map((f) => `testimonial_${f}`),
  ...trustFields.map((f) => `trust_${f}`),
  ...themeFields.map((f) => `theme_${f}`),
  ...services
];

module.exports = { acfContract };
