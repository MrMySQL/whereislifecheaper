import * as fs from 'fs';
import * as path from 'path';
import { parseFlatfyListPage, isDataDomeWall } from '../parse-flatfy';
import { roomsTextToBedrooms } from '../normalize';

const realFixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'flatfy-list-page.html'),
  'utf-8'
);
const blockedFixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'flatfy-blocked-page.html'),
  'utf-8'
);

describe('isDataDomeWall', () => {
  it('detects the DataDome / captcha wall', () => {
    expect(isDataDomeWall(blockedFixture)).toBe(true);
  });

  it('does not flag a real listings page', () => {
    expect(isDataDomeWall(realFixture)).toBe(false);
  });
});

describe('parseFlatfyListPage', () => {
  it('returns [] for a DataDome wall', () => {
    expect(parseFlatfyListPage(blockedFixture)).toEqual([]);
  });

  it('returns [] for empty html', () => {
    expect(parseFlatfyListPage('<html></html>')).toEqual([]);
  });

  it('extracts listing cards from the real fixture', () => {
    const listings = parseFlatfyListPage(realFixture);
    expect(listings.length).toBeGreaterThanOrEqual(20);
  });

  it('every listing has an absolute https URL, flatfy source, and a numeric price', () => {
    const listings = parseFlatfyListPage(realFixture);
    for (const l of listings) {
      expect(l.url).toMatch(/^https:\/\//);
      expect(l.source).toBe('flatfy');
      expect(l.priceText).toMatch(/\d/);
    }
  });

  it('maps roomsText to bedrooms for the majority of listings', () => {
    const listings = parseFlatfyListPage(realFixture);
    const withBeds = listings.filter(
      (l) => roomsTextToBedrooms(l.roomsText) !== null
    );
    expect(withBeds.length).toBeGreaterThan(listings.length * 0.5);
  });

  it('extracts sqmText for a good fraction of listings', () => {
    const listings = parseFlatfyListPage(realFixture);
    const withSqm = listings.filter((l) => l.sqmText !== null);
    expect(withSqm.length).toBeGreaterThan(listings.length * 0.5);
  });

  it('gives every listing a unique, id-based detail URL', () => {
    const urls = parseFlatfyListPage(realFixture).map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\/flatfy\.ua\/redirect\/\d+$/);
    }
  });

  it('extracts a clean district name, not the concatenated address blob', () => {
    const listings = parseFlatfyListPage(realFixture);
    const withDistrict = listings.filter((l) => l.district);
    expect(withDistrict.length).toBeGreaterThan(listings.length * 0.5);
    for (const l of withDistrict) {
      expect(l.district).not.toMatch(/ЖК/);
      expect((l.district as string).length).toBeLessThan(40);
    }
  });
});
