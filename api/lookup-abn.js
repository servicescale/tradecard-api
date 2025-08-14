// See chat history for full endpoint implementationexport default async function handler(req, res) {
  const input = req.query.search;
  if (!input) return res.status(400).json({ error: 'Missing ?search=' });

  const GUID = '550e4f63-2572-4715-a127-c52c76cf86d5';
  const searchVariants = [];
  const cleaned = input.replace(/\s+/g, '').replace(/[^0-9]/g, '');
  const isABN = cleaned.length === 11 && /^\d{11}$/.test(cleaned);

  if (isABN) searchVariants.push(cleaned);
  searchVariants.push(input);

  const parts = input.split(/\s+/);
  if (parts.length > 1) {
    searchVariants.push(parts[0], parts[parts.length - 1], parts.join(' '));
  }

  const tried = [];
  const results = [];

  for (const variant of [...new Set(searchVariants)]) {
    tried.push(variant);
    let endpoint;

    if (/^\d{11}$/.test(variant)) {
      endpoint = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${variant}&guid=${GUID}`;
    } else {
      endpoint = `https://abr.business.gov.au/json/MatchingNames.aspx?name=${encodeURIComponent(variant)}&maxResults=10&guid=${GUID}`;
    }

    try {
      const data = await fetch(endpoint).then(r => r.json());

      if (data && data.Abn) {
        results.push({
          abn: data.Abn,
          entityName: data.EntityName || '',
          entityType: data.EntityType?.EntityDescription || '',
          location: data.State || '',
          status: data.AbnStatus || '',
        });
        break;
      }

      if (Array.isArray(data.Names)) {
        for (const match of data.Names) {
          results.push({
            abn: match.Abn,
            entityName: match.Name,
            entityType: match.NameType,
            location: match.Postcode || '',
            status: match.IsCurrentIndicator ? 'Active' : 'Inactive'
          });
        }
        if (results.length > 0) break;
      }

    } catch {}
  }

  if (results.length === 0) {
    return res.status(404).json({ tried, error: 'No ABN results found' });
  }

  res.status(200).json({ tried, result: results[0], all_matches: results });
}
