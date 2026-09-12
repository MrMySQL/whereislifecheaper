import { readFileSync } from 'fs';
import { join } from 'path';
import { parseOlxListPage } from '../parse-olx';
import { roomsTextToBedrooms } from '../normalize';

const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'olx-list-page.html'),
  'utf-8',
);

describe('parseOlxListPage', () => {
  const structuredFixture = readFileSync(
    join(__dirname, 'fixtures', 'olx-structured-list-page.html'), 'utf-8',
  );

  test('uses structured room counts when the title does not identify rooms', () => {
    const [listing] = parseOlxListPage(structuredFixture);
    expect(listing.roomsText).toBe('1 кімната');
    expect(roomsTextToBedrooms(listing.roomsText)).toBe(0);
    expect(listing.sqmText).toBe('57 м²');
  });

  test('canonicalizes a listing URL by removing tracking parameters', () => {
    const [listing] = parseOlxListPage(structuredFixture);
    expect(listing.url).toBe('https://www.olx.ua/d/uk/obyavlenie/orenda-vul-urlvska-11-44-vlna-poruch-metro-osokorki-ID10veof.html');
  });

  test('does not include inline style contents in prices', () => {
    expect(parseOlxListPage(structuredFixture)[0].priceText).toBe('12 999 грн.');
  });

  test('falls back to card titles when embedded state is malformed', () => {
    const brokenState = structuredFixture.replace(/window\.__PRERENDERED_STATE__[\s\S]*?<\/script>/,
      'window.__PRERENDERED_STATE__ = "invalid JSON";</script>');
    expect(parseOlxListPage(brokenState)[1].roomsText).toBe('Без %! Ексклюзивна 3к сталінка на Бульварно-Кудрявській. Київ. Центр.');
  });

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
