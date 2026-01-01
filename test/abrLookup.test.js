const test = require('node:test');
const assert = require('node:assert');
const mockFetch = require('./helpers/mockFetch');
const { lookupABN } = require('../services/abrLookup');

test('lookupABN selects best match and returns ABR details', async () => {
  process.env.ABR_GUID = 'test-guid';
  const searchUrl = new URL('https://abr.business.gov.au/json/MatchingNames.aspx');
  searchUrl.searchParams.set('name', 'Acme Pty Ltd');
  searchUrl.searchParams.set('maxResults', '5');
  searchUrl.searchParams.set('guid', 'test-guid');

  const detailsUrl = new URL('https://abr.business.gov.au/json/AbnDetails.aspx');
  detailsUrl.searchParams.set('abn', '12345678901');
  detailsUrl.searchParams.set('guid', 'test-guid');

  const restore = mockFetch({
    [searchUrl.toString()]: {
      body: {
        Names: [
          {
            Abn: '12 345 678 901',
            Name: 'Acme Pty Ltd',
            NameType: 'Entity Name',
            State: 'NSW',
            EntityTypeName: 'Australian Private Company'
          },
          {
            Abn: '98 765 432 109',
            Name: 'Acme Plumbing',
            NameType: 'Trading Name',
            State: 'VIC',
            EntityTypeName: 'Sole Trader'
          }
        ]
      }
    },
    [detailsUrl.toString()]: {
      body: {
        EntityName: 'ACME PTY LTD',
        EntityTypeName: 'Australian Private Company',
        GstStatus: 'Active'
      }
    }
  });

  const result = await lookupABN({
    businessName: 'Acme Pty Ltd',
    tradingName: 'Acme Plumbing',
    state: 'NSW'
  });
  restore();

  assert.deepEqual(result, {
    abn: '12345678901',
    entityName: 'ACME PTY LTD',
    entityType: 'Australian Private Company',
    gstStatus: 'Active',
    state: 'NSW'
  });
});

test('lookupABN returns null when ABR has no matches', async () => {
  process.env.ABR_GUID = 'test-guid';
  const searchUrl = new URL('https://abr.business.gov.au/json/MatchingNames.aspx');
  searchUrl.searchParams.set('name', 'Missing Co');
  searchUrl.searchParams.set('maxResults', '5');
  searchUrl.searchParams.set('guid', 'test-guid');

  const restore = mockFetch({
    [searchUrl.toString()]: { body: { Names: [] } }
  });

  const result = await lookupABN({ businessName: 'Missing Co' });
  restore();

  assert.equal(result, null);
});
