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
  assert.deepEqual(page.headings.h1, ['H1']);
  assert.deepEqual(page.headings.h2, ['H2']);
  assert.deepEqual(page.headings.h3, ['H3']);
  assert.ok(page.images.every(u => u.startsWith('http://example.com/') && !u.includes('?') && !u.includes('#')));
  assert.equal(new Set(page.images).size, page.images.length);
  assert.ok(page.social.find(s => s.platform === 'facebook'));
  assert.deepEqual(page.contacts.emails, ['info@example.com']);
  assert.deepEqual(page.contacts.phones, ['+123456']);
});

test('parse captures videos, contact forms, awards and theme colors', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/trust_theme.html'), 'utf8');
  const page = await parse(html, 'https://example.com');
  assert.equal(page.theme_colors.primary, '#336699');
  assert.deepEqual(page.contact_form_links, ['https://example.com/contact']);
  assert.ok(page.profile_videos.includes('https://youtube.com/watch?v=abc'));
  assert.equal(page.awards[0].text, 'Best Award 2023');
});
