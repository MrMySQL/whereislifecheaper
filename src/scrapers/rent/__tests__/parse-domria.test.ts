import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDomriaListPage } from '../parse-domria';
import { roomsTextToBedrooms } from '../normalize';

const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'domria-list-page.html'),
  'utf-8',
);

describe('parseDomriaListPage', () => {
  test('extracts at least 15 cards from the fixture', () => {
    const listings = parseDomriaListPage(FIXTURE);
    expect(listings.length).toBeGreaterThanOrEqual(15);
  });

  test('each listing has a usable URL and source=domria', () => {
    const listings = parseDomriaListPage(FIXTURE);
    for (const l of listings) {
      expect(l.url).toMatch(/^https?:\/\//);
      expect(l.source).toBe('domria');
    }
  });

  test('every listing has a price string containing a digit', () => {
    const listings = parseDomriaListPage(FIXTURE);
    const withPrice = listings.filter((l) => /\d/.test(l.priceText));
    expect(withPrice.length).toBe(listings.length);
  });

  test('the vast majority of listings have parseable rooms text', () => {
    // DOM.RIA exposes rooms in structured characteristics, so coverage should
    // be near-100%.
    const listings = parseDomriaListPage(FIXTURE);
    const withRooms = listings.filter((l) => roomsTextToBedrooms(l.roomsText) !== null);
    expect(withRooms.length).toBeGreaterThan(listings.length * 0.9);
  });

  test('district is populated for most listings', () => {
    const listings = parseDomriaListPage(FIXTURE);
    const withDistrict = listings.filter((l) => l.district);
    expect(withDistrict.length).toBeGreaterThan(listings.length * 0.8);
  });
});
