const test = require('node:test');
const assert = require('node:assert');

const mockFetch = require('./helpers/mockFetch');
const resetEnv = require('./helpers/resetEnv');
const { applyIntent } = require('../lib/intent');

test('applyIntent uses LLM and returns fields', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': {
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                identity_business_name: 'Biz',
                identity_website_url: 'http://example.com',
                identity_email: 'a@b.com',
                identity_phone: '123',
                business_description: 'Great',
                service_1_title: 'S1',
                service_1_description: 'Desc',
                service_1_image_url: 'img',
                service_areas_csv: 'A',
                social_links_facebook: 'http://fb.com/biz'
              })
            }
          }
        ]
      }
    }
  });

  const intent = await applyIntent({}, {
    raw: {
      anchors: [
        { href: 'mailto:a@b.com' },
        { href: 'tel:123' }
      ],
      headings: ['h'],
      paragraphs: ['p'],
      images: [{ src: 'img', alt: '' }]
    }
  });
  restore();

  assert.equal(intent.fields.identity_business_name, 'Biz');
  assert.ok(intent.sent_keys.includes('business_description'));
  assert.equal(intent.sent_keys.length, Object.keys(intent.fields).length);
});

test('applyIntent invokes LLM when MVF fills many fields', async () => {
  resetEnv({ OPENAI_API_KEY: 'k' });
  const restore = mockFetch({
    'https://api.openai.com/v1/chat/completions': { json: { choices: [{ message: { content: '{}' } }] } }
  });
  const raw = {
    anchors: [
      { href: 'mailto:a@b.com' },
      { href: 'tel:123' },
      { href: 'https://facebook.com/x' },
      { href: 'https://instagram.com/x' },
      { href: 'https://linkedin.com/x' },
      { href: 'https://x.com/x' },
      { href: 'https://youtube.com/x' },
      { href: 'https://tiktok.com/x' },
      { href: 'https://pinterest.com/x' }
    ],
    jsonld: [
      { '@type': 'Organization', name: 'Org', url: 'http://example.com' }
    ]
  };
  await applyIntent({}, { raw });
  const calls = restore.calls.length;
  restore();
  assert.equal(calls, 1);
});
