import fs from 'fs';
import path from 'path';
import { parseDomainAuListPage } from '../parse-domain-au';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('parseDomainAuListPage', () => {
  test('recognizes declared studios with one or missing bedrooms without importing parking spaces', () => {
    const listings = parseDomainAuListPage(fixture('domain-au-studios.html'));

    expect(listings).toHaveLength(2);
    expect(listings.map((listing) => listing.roomsText)).toEqual(['Studio', 'Studio']);
    expect(listings.map((listing) => listing.priceText)).toEqual(['$750 per week', '$700 per week']);
  });

  test('extracts listings from Domain __NEXT_DATA__ payload', () => {
    const listings = parseDomainAuListPage(fixture('domain-au-list-page.html'));

    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      source: 'domainau',
      url: 'https://www.domain.com.au/703-29-commonwealth-street-sydney-nsw-2000-18145629',
      priceText: '$880 per week',
      roomsText: '1 Bed',
      sqmText: null,
      district: 'Sydney',
    });
    expect(listings[1]).toMatchObject({
      roomsText: 'Studio',
      sqmText: '55 m²',
    });
  });

  test('extracts listings when Domain nests the search payload under componentProps', () => {
    const nestedFixture = fixture('domain-au-list-page.html').replace(
      '"componentProps": {\n              "listingSearchResultIds"',
      '"componentProps": {\n              "componentProps": {\n              "listingSearchResultIds"',
    ).replace(
      '            }\n          }\n        }',
      '              }\n            }\n          }\n        }',
    );

    const listings = parseDomainAuListPage(nestedFixture);

    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      source: 'domainau',
      url: 'https://www.domain.com.au/703-29-commonwealth-street-sydney-nsw-2000-18145629',
    });
  });
});
