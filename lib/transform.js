export function transformForProfile(raw) {
  const structured = {};

  structured.identity_website = raw.site || null;
  structured.identity_abn = raw.abn_lookup?.abn || null;
  structured.identity_business_name = raw.abn_lookup?.entityName || null;
  structured.identity_business_type = raw.abn_lookup?.entityType || null;
  structured.identity_state = raw.abn_lookup?.location || null;

  for (const [platform, url] of Object.entries(raw.social_links || {})) {
    structured[`social_links_${platform}`] = url;
  }

  const textBlob = raw.pages.map(p => p.text.join(' ')).join(' ');
  const emailMatch = textBlob.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const phoneMatch = textBlob.match(/\+?[\d ]{9,15}/);

  if (emailMatch) structured.identity_email = emailMatch[0];
  if (phoneMatch) structured.identity_phone = phoneMatch[0];

  return structured;
}