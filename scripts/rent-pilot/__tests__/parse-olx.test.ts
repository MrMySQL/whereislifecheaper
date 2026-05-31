import { readFileSync } from 'fs';
import { join } from 'path';
import { parseOlxListPage } from '../parse-olx';
import { roomsTextToBedrooms } from '../normalize';

const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'olx-list-page.html'),
  'utf-8',
);

describe('parseOlxListPage', () => {
  test('extracts at least 20 cards from the fixture', () => {
    const listings = parseOlxListPage(FIXTURE);
    expect(listings.length).toBeGreaterThanOrEqual(20);
  });

  test('each listing has a usable URL and source=olx', () => {
    const listings = parseOlxListPage(FIXTURE);
    for (const l of listings) {
      expect(l.url).toMatch(/^https?:\/\//);
      expect(l.source).toBe('olx');
    }
  });

  test('every listing has a price string containing a digit', () => {
    const listings = parseOlxListPage(FIXTURE);
    const withPrice = listings.filter((l) => /\d/.test(l.priceText));
    expect(withPrice.length).toBe(listings.length);
  });

  test('the majority of listings have parseable rooms text', () => {
    // OLX titles are user-written and not all of them mention room count, but
    // most do. We require at least 50% of cards to yield a non-null bedroom
    // value so the pilot has enough signal to aggregate.
    const listings = parseOlxListPage(FIXTURE);
    const withRooms = listings.filter((l) => roomsTextToBedrooms(l.roomsText) !== null);
    expect(withRooms.length).toBeGreaterThan(listings.length * 0.5);
  });
});
