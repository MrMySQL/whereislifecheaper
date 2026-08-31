import { scrapeRent } from '../RentScraperService';
import { scrapeOlx } from '../scrape-olx';
import { scrapeDomria } from '../scrape-domria';
import { scrapeFlatfy } from '../scrape-flatfy';
import { scrapeRealestateAu } from '../scrape-realestate-au';
import { scrapeDomainAu } from '../scrape-domain-au';
import { query } from '../../../config/database';
import { normalizeListing, loadRatesToEur } from '../normalize';

const insertManyMock = jest.fn();

jest.mock('../scrape-olx', () => ({ scrapeOlx: jest.fn() }));
jest.mock('../scrape-domria', () => ({ scrapeDomria: jest.fn() }));
jest.mock('../scrape-flatfy', () => ({ scrapeFlatfy: jest.fn() }));
jest.mock('../scrape-realestate-au', () => ({ scrapeRealestateAu: jest.fn() }));
jest.mock('../scrape-domain-au', () => ({ scrapeDomainAu: jest.fn() }));
jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../repositories/RentalListingRepository', () => ({
  RentalListingRepository: jest.fn().mockImplementation(() => ({
    insertMany: insertManyMock,
  })),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));
jest.mock('../normalize', () => ({
  loadRatesToEur: jest.fn(),
  buildLocalConverter: jest.fn(() => jest.fn((amount: number) => amount)),
  normalizeListing: jest.fn(),
}));

const rawListing = {
  source: 'olx' as const,
  url: 'https://www.olx.ua/d/uk/obyavlenie/x-ID1.html',
  priceText: '25 000 грн',
  roomsText: '2-кімнатна квартира',
  sqmText: '50 м²',
  district: 'Центр',
  listedAtText: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (query as jest.Mock).mockResolvedValue({
    rows: [{ id: 7, currency_code: 'UAH' }],
  });
  (loadRatesToEur as jest.Mock).mockResolvedValue(new Map([['UAH', 1], ['AUD', 0.6]]));
  (scrapeOlx as jest.Mock).mockResolvedValue([rawListing]);
  (scrapeDomria as jest.Mock).mockResolvedValue([]);
  (scrapeFlatfy as jest.Mock).mockResolvedValue([]);
  (scrapeRealestateAu as jest.Mock).mockResolvedValue([]);
  (scrapeDomainAu as jest.Mock).mockResolvedValue([]);
  insertManyMock.mockResolvedValue(0);
});

describe('scrapeRent', () => {
  test('fails the job when no source produces usable normalized listings', async () => {
    (normalizeListing as jest.Mock).mockReturnValue(null);

    await expect(scrapeRent()).rejects.toThrow(/No usable rent listings/i);

    expect(insertManyMock).not.toHaveBeenCalled();
  });
});

describe('scrapeRent source health reporting', () => {
  beforeEach(() => {
    (normalizeListing as jest.Mock).mockImplementation((r) => ({
      source: r.source,
      url: r.url,
      sourceListingId: 'ID1',
      priceOriginal: 25000,
      currencyOriginal: 'UAH',
      priceLocal: 25000,
      bedrooms: 2,
      sqm: 50,
      district: null,
    }));
    insertManyMock.mockResolvedValue(1);
  });

  test('reports a per-source outcome for every configured source', async () => {
    const summary = await scrapeRent();

    expect(summary.sources.map((s) => s.name).sort()).toEqual(
      ['domainau', 'domria', 'flatfy', 'olx', 'realestateau'].sort(),
    );
  });

  test('marks a source that returned nothing as dead, not ok', async () => {
    const summary = await scrapeRent();

    const olx = summary.sources.find((s) => s.name === 'olx');
    const flatfy = summary.sources.find((s) => s.name === 'flatfy');
    expect(olx).toMatchObject({ status: 'ok', raw: 1, inserted: 1 });
    expect(flatfy).toMatchObject({ status: 'dead', raw: 0, inserted: 0 });
  });

  test('records the error when a source throws, without aborting the rest', async () => {
    (scrapeDomria as jest.Mock).mockRejectedValue(new Error('Timeout 30000ms exceeded'));

    const summary = await scrapeRent();

    const domria = summary.sources.find((s) => s.name === 'domria');
    expect(domria).toMatchObject({ status: 'error' });
    expect(domria?.error).toMatch(/Timeout/);
    // olx still ran and still inserted
    expect(summary.sources.find((s) => s.name === 'olx')).toMatchObject({ status: 'ok' });
  });

  test('flags a source expected healthy that produced nothing as a regression', async () => {
    (scrapeOlx as jest.Mock).mockResolvedValue([]);
    // domria still works, so the run is a partial failure rather than a total
    // one - the summary is returned instead of the whole run throwing.
    (scrapeDomria as jest.Mock).mockResolvedValue([{ ...rawListing, source: 'domria' }]);

    const summary = await scrapeRent();

    expect(summary.regressions.map((r) => r.name)).toContain('olx');
    // flatfy is known-blocked, so its failure is not a regression
    expect(summary.regressions.map((r) => r.name)).not.toContain('flatfy');
  });

  test('flags a known-blocked source that started working, so it can be promoted', async () => {
    (scrapeFlatfy as jest.Mock).mockResolvedValue([{ ...rawListing, source: 'flatfy' }]);

    const summary = await scrapeRent();

    expect(summary.recovered.map((r) => r.name)).toContain('flatfy');
  });

  test('a regression carries the target it failed for, not just the source name', async () => {
    (scrapeOlx as jest.Mock).mockResolvedValue([]);
    (scrapeDomria as jest.Mock).mockResolvedValue([{ ...rawListing, source: 'domria' }]);

    const summary = await scrapeRent();

    // The outcome list is keyed by (target, source) - a bare name cannot say
    // which city died once a country has more than one.
    expect(summary.regressions).toContainEqual(
      expect.objectContaining({ name: 'olx', countryCode: 'UA', city: expect.any(String) }),
    );
  });

  test('still throws when every source is dead', async () => {
    (normalizeListing as jest.Mock).mockReturnValue(null);

    await expect(scrapeRent()).rejects.toThrow(/No usable rent listings/i);
  });
});
