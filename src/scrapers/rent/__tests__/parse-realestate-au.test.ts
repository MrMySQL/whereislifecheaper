import fs from 'fs';
import path from 'path';
import { parseRealestateAuListPage } from '../parse-realestate-au';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

function searchPage(items: unknown[]): string {
  return `<script>window.ArgonautExchange=${JSON.stringify({
    'resi-property_listing-experience-web': {
      urqlClientCache: JSON.stringify({
        search: { data: JSON.stringify({ rentSearch: { results: { exact: { items } } } }) },
      }),
    },
  })};</script>`;
}

describe('parseRealestateAuListPage', () => {
  test.each([
    ['missing listing', [{}]],
    ['null listing', [{ listing: null }]],
    ['empty listing', [{ listing: {} }]],
    ['listing without bedrooms', [{ listing: {
      _links: { canonical: { href: 'https://www.realestate.com.au/property-apartment-nsw-sydney-444313808' } },
      price: { display: '$880 per week' },
    } }]],
  ])('rejects a nonempty search with no usable listings in strict mode: %s', (_label, items) => {
    expect(() => parseRealestateAuListPage(searchPage(items as unknown[]), true)).toThrow(/search payload/i);
  });

  test('accepts an explicitly empty search in strict mode', () => {
    expect(parseRealestateAuListPage(searchPage([]), true)).toEqual([]);
  });

  test('keeps tolerant parsing available for unusable listings', () => {
    expect(parseRealestateAuListPage(searchPage([{ listing: {} }]))).toEqual([]);
  });

  test('extracts listings from realestate.com.au ArgonautExchange cache', () => {
    const listings = parseRealestateAuListPage(fixture('realestate-au-list-page.html'));

    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      source: 'realestateau',
      url: 'https://www.realestate.com.au/property-apartment-nsw-sydney-444313808',
      priceText: '$880 per week',
      roomsText: '1 Bed',
      sqmText: null,
      district: 'Sydney',
    });
    expect(listings[1]).toMatchObject({
      roomsText: 'Studio',
      sqmText: '42m²',
    });
  });
});
