import fs from 'fs';
import path from 'path';
import { parseRealestateAuListPage } from '../parse-realestate-au';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('parseRealestateAuListPage', () => {
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
