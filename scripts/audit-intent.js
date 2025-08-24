#!/usr/bin/env node
'use strict';

const fs = require('fs');
const YAML = require('yaml');
const http = require('http');

// Load and expand intent map
const configPath = 'config/field_intent_map.yaml';
if (!fs.existsSync(configPath)) {
  console.error(`Missing ${configPath}`);
  process.exit(1);
}
const text = fs.readFileSync(configPath, 'utf8');
const doc = YAML.parse(text) || {};
const intentAllow = new Set();
Object.keys(doc).forEach((key) => {
  if (key.includes('service_{i}_')) {
    [1, 2, 3].forEach((i) => intentAllow.add(key.replace('{i}', i)));
  } else {
    intentAllow.add(key);
  }
});

// Build ACF schema allow set
const identityFields = [
  'business_name',
  'business_type',
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
  'insured',
  'website',
  'location_label',
  'services',
  'display_name',
  'verified',
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
  'vcf_url',
  'award',
  'award_link'
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
  'service_tags'
];
const services = [];
[1, 2, 3].forEach((i) => {
  serviceFields.forEach((f) => services.push(`service_${i}_${f}`));
});

const schemaAllow = new Set([
  ...identityFields.map((f) => `identity_${f}`),
  ...socialPlatforms.map((p) => `social_links_${p}`),
  'business_description',
  'service_areas_csv',
  ...testimonialFields.map((f) => `testimonial_${f}`),
  ...trustFields.map((f) => `trust_${f}`),
  ...themeFields.map((f) => `theme_${f}`),
  ...services
]);

// Categorisation
function categorize(key) {
  if (key.startsWith('identity_')) return 'identity';
  if (key.startsWith('social_links_')) return 'socials';
  if (key.startsWith('service_')) return 'services';
  if (key.startsWith('testimonial_')) return 'testimonials';
  if (key.startsWith('trust_') || key.startsWith('theme_')) return 'trust/theme';
  return 'misc';
}

const categories = ['identity', 'socials', 'services', 'testimonials', 'trust/theme', 'misc'];
const stats = {};
categories.forEach((c) => {
  stats[c] = {
    category: c,
    schema: 0,
    intent: 0,
    intersection: 0,
    missing_in_intent: 0,
    extra_in_intent: 0,
  };
});

// Count intent keys
intentAllow.forEach((key) => {
  const cat = categorize(key);
  stats[cat].intent++;
});

// Count schema keys and intersections/missing
schemaAllow.forEach((key) => {
  const cat = categorize(key);
  stats[cat].schema++;
  if (intentAllow.has(key)) {
    stats[cat].intersection++;
  } else {
    stats[cat].missing_in_intent++;
  }
});

// Count extras in intent not in schema
intentAllow.forEach((key) => {
  if (!schemaAllow.has(key)) {
    const cat = categorize(key);
    stats[cat].extra_in_intent++;
  }
});

const total = {
  category: 'TOTAL',
  schema: schemaAllow.size,
  intent: intentAllow.size,
  intersection: [...schemaAllow].filter((k) => intentAllow.has(k)).length,
  missing_in_intent: [...schemaAllow].filter((k) => !intentAllow.has(k)).length,
  extra_in_intent: [...intentAllow].filter((k) => !schemaAllow.has(k)).length,
};

const summary = {
  total,
  categories: categories.map((c) => stats[c]),
};

console.log(JSON.stringify(summary, null, 2));

// Optional run mode
const runIndex = process.argv.indexOf('--run');
if (runIndex !== -1) {
  const target = process.argv[runIndex + 1];
  if (!target) {
    console.error('Missing target URL after --run');
    process.exit(1);
  }
  const url = `http://localhost:3000/api/build?url=${encodeURIComponent(
    target
  )}&push=1&debug=1`;
  http
    .get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const steps = Array.isArray(json.steps) ? json.steps : [];
          const acf = steps.find((s) => s.name === 'acf_sync') || {};
          const sent = Array.isArray(acf.sent_keys) ? acf.sent_keys : [];
          const result = {
            sent_keys_count: sent.length,
            status: acf.status || null,
            sample_allowed_but_not_sent: [...schemaAllow]
              .filter((k) => !sent.includes(k))
              .slice(0, 10),
          };
          console.log(JSON.stringify(result, null, 2));
        } catch (err) {
          console.error('Invalid JSON response:', err.message);
        }
      });
    })
    .on('error', (err) => {
      console.error('HTTP error:', err.message);
    });
}
