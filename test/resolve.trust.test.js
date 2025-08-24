const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../lib/parse');
const { applyIntent } = require('../lib/intent');
const mockFetch = require('./helpers/mockFetch');

function darken(hex) {
  let h = hex.replace('#','');
  if(h.length===3) h=h.split('').map(c=>c+c).join('');
  const num=parseInt(h,16);
  let r=Math.round(((num>>16)&255)*0.9);
  let g=Math.round(((num>>8)&255)*0.9);
  let b=Math.round((num&255)*0.9);
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

test('resolution integrates reviews and derives trust fields', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/trust_theme.html'), 'utf8');
  const raw = await parse(html, 'https://example.com');
  const restore = mockFetch({
    'https://www.google.com/maps?cid=123': { json: { rating: 4.8, review_count: 25, url: 'https://www.google.com/maps?cid=123' } }
  });
  const tradecard = { tradecard_url: 'https://tradecard.au/testbiz' };
  const { fields } = await applyIntent(tradecard, { raw, resolve: 'none' });
  restore();
  assert.equal(fields.trust_google_rating, '4.8');
  assert.equal(fields.trust_google_review_count, '25');
  assert.equal(fields.trust_google_review_url, 'https://www.google.com/maps?cid=123');
  assert.equal(fields.trust_review_button_link, 'https://www.google.com/maps?cid=123');
  assert.equal(fields.theme_primary_color, '#336699');
  assert.equal(fields.theme_accent_color, darken('#336699'));
  assert.equal(fields.trust_award, 'Best Award 2023');
  assert.equal(fields.trust_award_link, 'https://example.com/award');
  assert.equal(fields.trust_contact_form, 'https://example.com/contact');
  assert.equal(fields.trust_profile_video_url, 'https://youtube.com/watch?v=abc');
  assert.equal(fields.trust_qr_text, 'https://tradecard.au/testbiz');
  assert.equal(fields.trust_vcf_url, 'https://contact.tradecard.au/testbiz.vcf');
});
