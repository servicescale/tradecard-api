const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../lib/parse');
const mockFetch = require('./helpers/mockFetch');
const det = require('../lib/detExtractors');
const { applyIntent } = require('../lib/intent');

test('parse extracts canonical images, headings, socials, contacts', async () => {
  const restore = mockFetch({
    'http://example.com/style.css': { body: 'body{background:url("http://example.com/css.png?cache=1");}' },
    'http://example.com/imported.css': { body: 'h1{background:url("http://example.com/import.png#frag");}' }
  });
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/simple.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  restore();

  assert.equal(page.title, 'Simple Page');
  assert.equal(page.page_language, 'en');
  assert.deepEqual(page.headings.h1, ['H1']);
  assert.deepEqual(page.headings.h2, ['H2']);
  assert.deepEqual(page.headings.h3, ['H3']);
  assert.ok(page.images.every(i => i.url.startsWith('http://example.com/') && !i.url.includes('?') && !i.url.includes('#')));
  assert.equal(new Set(page.images.map(i => i.url)).size, page.images.length);
  assert.equal(page.images.find(i => i.alt === 'Duplicate').url, 'http://example.com/dup.png');
  assert.equal(page.images.find(i => i.alt === 'Lazy').url, 'http://example.com/other.png');
  assert.deepEqual(page.headings.h4, ['H4']);
  assert.deepEqual(page.headings.h5, ['H5']);
  assert.deepEqual(page.headings.h6, ['H6']);
  const plats = ['facebook','instagram','linkedin','twitter','youtube','tiktok','pinterest'];
  for (const p of plats) {
    assert.ok(page.social.find(s => s.platform === p), `missing ${p}`);
  }
  assert.deepEqual(page.contacts.emails, ['info@example.com']);
  assert.deepEqual(page.contacts.phones, ['+123456']);
});

test('parse finds contacts in free text', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/free_text_contact.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  assert.deepEqual(page.contacts.emails, ['contact@example.com']);
  assert.deepEqual(page.contacts.phones, ['+61400123456']);
  assert.equal(page.identity_email, 'contact@example.com');
  assert.equal(page.identity_phone, '+61400123456');
});

test('parse captures videos, contact forms and awards', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/trust_theme.html'), 'utf8');
  const page = await parse(html, 'https://example.com');
  assert.deepEqual(page.contact_form_links, ['https://example.com/contact']);
  assert.ok(page.profile_videos.includes('https://youtube.com/watch?v=abc'));
  assert.equal(page.awards[0].text, 'Best Award 2023');
});

test('parse extracts on-site testimonials', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/testimonial.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  assert.ok(Array.isArray(page.testimonials));
  assert.deepEqual(page.testimonials[0], {
    quote: 'Great job on our deck.',
    reviewer: 'Jane Smith',
    location: 'Melbourne',
    source_label: 'Google Reviews',
    source_url: 'https://maps.google.com/?cid=1',
    job_type: 'Deck installation'
  });
});

test('parse enriches identity fields from Organization JSON-LD', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/jsonld-org.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  assert.equal(page.identity_business_name, 'Acme Corp');
  assert.equal(page.identity_logo_url, 'http://example.com/logo.png');
  assert.equal(page.identity_address, '123 Street, Townsville, NSW');
  assert.equal(page.identity_phone, '+61212345678');
  assert.ok(page.social.find(s => s.platform === 'facebook' && s.url === 'https://facebook.com/acme'));
  assert.ok(page.social.find(s => s.platform === 'twitter' && s.url === 'https://twitter.com/acme'));
});

test('parse enriches identity fields from Person JSON-LD', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/jsonld-person.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  assert.equal(page.identity_owner_name, 'John Smith');
  assert.equal(page.identity_phone, '+1555000');
  assert.ok(page.social.find(s => s.platform === 'instagram' && s.url === 'https://instagram.com/johnsmith'));
});

test('parse detects alternate panels, projects, owner and contact form', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/alt_patterns.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  assert.equal(page.service_panels.length, 2);
  assert.equal(page.service_panels[0].price, '$50');
  assert.equal(page.service_panels[1].price, '$80');
  assert.equal(page.projects.length, 1);
  assert.equal(page.projects[0].title, 'Project Alpha');
  assert.equal(page.identity_owner_name, 'Alice Owner');
  assert.equal(page.identity_role_title, 'Founder');
  assert.equal(page.identity_headshot_url, 'http://example.com/headshot.jpg');
  assert.deepEqual(page.contact_form_links, ['http://example.com/submit']);
});

test('parse extracts service panel titles', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/service_panel_titles.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  assert.equal(page.service_panels.length, 2);
  assert.equal(page.service_panels[0].title, 'Panel 1');
  assert.equal(page.service_panels[1].title, 'Panel 2');
});

test('parse extracts extended meta fields and counts', async () => {
  const restore = mockFetch({ 'https://example.com/style.css': { body: '' } });
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/meta.html'), 'utf8');
  const page = await parse(html, 'https://example.com');
  restore();
  assert.equal(page.canonical_url, 'https://example.com/canonical');
  assert.equal(page.meta_description, 'Desc');
  assert.equal(page.meta_theme_color, '#ff0000');
  assert.equal(page.theme_primary_color, '#ff0000');
  assert.equal(page.og_title, 'OG Title');
  assert.equal(page.twitter_card, 'summary_large_image');
  assert.equal(page.favicon_url, 'https://example.com/favicon.ico');
  assert.equal(page.apple_touch_icon_url, 'https://example.com/apple.png');
  assert.equal(page.link_internal_count, 1);
    assert.equal(page.link_external_count, 2);
  assert.equal(page.link_mailto_count, 1);
  assert.equal(page.link_tel_count, 1);
  assert.equal(page.link_sms_count, 1);
  assert.equal(page.link_whatsapp_count, 1);
  assert.equal(page.script_count, 2);
  assert.equal(page.stylesheet_count, 1);
  assert.equal(page.first_paragraph_text, 'First paragraph.');
});

test('parse derives theme_primary_color from inline CSS vars', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/theme_color_inline.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  assert.equal(page.theme_primary_color, '#112233');
});

test('parse derives theme_primary_color from linked stylesheet vars', async () => {
  const restore = mockFetch({ 'http://example.com/theme.css': { body: ':root{--color-primary:#abcdef;}' } });
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/theme_color_linked.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  restore();
  assert.equal(page.theme_primary_color, '#abcdef');
});

test('detExtractors handle rare phone, address and ID patterns', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/rare_patterns.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  const ph = det.getPhone(page);
  const addr = det.getAddress(page);
  assert.equal(ph.value, '+61298765432');
  assert.equal(addr.value, 'PO Box 123, Townsville NSW 3000');
});

test('intent fills address when parse misses but det.getAddress succeeds', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/address_heading_only.html'), 'utf8');
  const page = await parse(html, 'http://example.com');
  assert.equal(page.identity_address, null);
  const addr = det.getAddress(page);
  assert.equal(addr.value, '456 Example Street, Sydney, NSW 2000');
  const raw = { ...page, headings: Object.values(page.headings).flat() };
  const { fields } = await applyIntent({}, { raw, opts: { noLLM: true } });
  assert.equal(fields.identity_address, '456 Example Street, Sydney, NSW 2000');
});
