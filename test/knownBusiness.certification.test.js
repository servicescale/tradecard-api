const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../lib/parse');
const { buildTradecardFromPages, collectRawFromPages } = require('../lib/build');
const { applyIntent } = require('../lib/intent');

test('known business certification.com resolves stable identity fields', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/certification.com.html'), 'utf8');
  const page = await parse(html, 'https://certification.com');
  const pages = [page];

  const result = buildTradecardFromPages('https://certification.com', pages);
  const raw = collectRawFromPages('https://certification.com', pages);
  const intent = await applyIntent(result.tradecard, { raw, opts: { noLLM: true } });

  assert.equal(intent.fields.identity_business_name, 'Paul Barry Certification');
  assert.equal(intent.fields.identity_email, 'hello@certification.com');
  assert.equal(intent.fields.identity_phone, '+61400111222');
  assert.equal(intent.fields.identity_address, '123 Main St, Sydney, NSW 2000');
  assert.equal(intent.fields.identity_website_url, 'https://certification.com/');
  assert.equal(intent.fields.service_1_title, 'Business Certification');
  assert.equal(intent.fields.service_1_price, '$199');
  assert.equal(intent.fields.service_1_cta_link, 'https://certification.com/book');
});

test('known business certification.com full resolve uses full raw and merges LLM proposals', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/certification.com.html'), 'utf8');
  const page = await parse(html, 'https://certification.com');
  const pages = [page];

  const result = buildTradecardFromPages('https://certification.com', pages);
  const raw = collectRawFromPages('https://certification.com', pages);

  const origFetch = global.fetch;
  const origKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';

  let fullFramePayload;
  const businessDescription = 'Paul Barry Certification helps businesses stay compliant with audits, documentation, and guidance across industries, offering clear reporting, practical recommendations, and responsive support for ongoing compliance needs.';
  const serviceDescription = 'The business certification service includes a structured assessment, documentation review, and compliance coaching, delivering clear findings, improvement steps, and follow-up support so clients can meet regulatory standards confidently every time.';
  const testimonialQuote = 'Great service with thorough guidance and quick responses; the team made certification straightforward and kept our business compliant and confident.';

  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const payload = JSON.parse(body.messages[1].content);
    if (payload.ALLOW_KEYS) {
      fullFramePayload = payload;
      return {
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  business_description: businessDescription,
                  service_1_description: serviceDescription,
                  testimonial_quote: testimonialQuote
                })
              }
            }
          ]
        })
      };
    }
    if (payload.ORIGINAL) {
      return {
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(payload.ORIGINAL) } }]
        })
      };
    }
    return {
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ value: '', confidence: 0 }) } }]
      })
    };
  };

  try {
    const intent = await applyIntent(result.tradecard, { raw, fullFrame: true });

    assert.ok(fullFramePayload, 'expected full-frame LLM payload');
    assert.ok(Array.isArray(fullFramePayload.RAW.service_panels), 'expected service panels in full raw payload');
    assert.ok(Array.isArray(fullFramePayload.RAW.testimonials), 'expected testimonials in full raw payload');
    assert.equal(intent.fields.business_description, businessDescription);
    assert.equal(intent.fields.service_1_description, serviceDescription);
    assert.equal(intent.fields.testimonial_quote, testimonialQuote);
  } finally {
    global.fetch = origFetch;
    process.env.OPENAI_API_KEY = origKey;
  }
});
