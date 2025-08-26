const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../lib/parse');
const mockFetch = require('./helpers/mockFetch');

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

test('parse extracts extended meta fields and counts', async () => {
  const restore = mockFetch({ 'https://example.com/style.css': { body: '' } });
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/meta.html'), 'utf8');
  const page = await parse(html, 'https://example.com');
  restore();
  assert.equal(page.canonical_url, 'https://example.com/canonical');
  assert.equal(page.meta_description, 'Desc');
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
