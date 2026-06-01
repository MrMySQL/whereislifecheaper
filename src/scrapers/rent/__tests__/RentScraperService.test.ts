import { scrapeRent } from '../RentScraperService';
import { scrapeOlx } from '../scrape-olx';
import { scrapeDomria } from '../scrape-domria';
import { scrapeFlatfy } from '../scrape-flatfy';
import { query } from '../../../config/database';
import { normalizeListing, loadRatesToEur } from '../normalize';

const insertManyMock = jest.fn();

jest.mock('../scrape-olx', () => ({ scrapeOlx: jest.fn() }));
jest.mock('../scrape-domria', () => ({ scrapeDomria: jest.fn() }));
jest.mock('../scrape-flatfy', () => ({ scrapeFlatfy: jest.fn() }));
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
  (loadRatesToEur as jest.Mock).mockResolvedValue(new Map([['UAH', 1]]));
  (scrapeOlx as jest.Mock).mockResolvedValue([rawListing]);
  (scrapeDomria as jest.Mock).mockResolvedValue([]);
  (scrapeFlatfy as jest.Mock).mockResolvedValue([]);
  insertManyMock.mockResolvedValue(0);
});

describe('scrapeRent', () => {
  test('fails the job when no source produces usable normalized listings', async () => {
    (normalizeListing as jest.Mock).mockReturnValue(null);

    await expect(scrapeRent()).rejects.toThrow(/No usable rent listings/i);

    expect(insertManyMock).not.toHaveBeenCalled();
  });
});
