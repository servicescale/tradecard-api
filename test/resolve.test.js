const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { resolveTestimonial } = require('../lib/resolve');

test('resolveTestimonial prefers on-site testimonial', () => {
  const site = [{
    quote: 'Site quote',
    reviewer: 'Bob',
    location: 'Brisbane',
    source_label: 'Website',
    source_url: 'http://example.com',
    job_type: 'Roofing'
  }];
  const gmb = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gmb.json'), 'utf8')).testimonials;
  const out = resolveTestimonial(site, gmb);
  assert.deepEqual(out, {
    quote: 'Site quote',
    reviewer: 'Bob',
    location: 'Brisbane',
    source_label: 'Website',
    source_url: 'http://example.com',
    job_type: 'Roofing'
  });
});

test('resolveTestimonial falls back to gmb and derives source label', () => {
  const gmb = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gmb.json'), 'utf8')).testimonials;
  const out = resolveTestimonial([], gmb);
  assert.equal(out.quote, 'Excellent work.');
  assert.equal(out.reviewer, 'Alice');
  assert.equal(out.location, 'Sydney');
  assert.equal(out.source_url, 'https://maps.google.com/?cid=2');
  assert.equal(out.source_label, 'Google');
});
