export type Source = 'olx' | 'domria' | 'flatfy';

export type Currency = 'UAH' | 'USD' | 'EUR';

/** Raw listing as scraped from a list page (pre-normalization). */
export interface ListingRaw {
  source: Source;
  url: string;
  priceText: string;
  roomsText: string;
  sqmText: string | null;
  district: string | null;
  listedAtText: string | null;
}

/** A listing normalized for persistence, priced in the country's own currency. */
export interface RentListingNormalized {
  source: Source;
  url: string;
  sourceListingId: string;
  priceOriginal: number;
  currencyOriginal: Currency;
  priceLocal: number;     // converted to the country's currency
  bedrooms: number;       // rooms - 1 (studio = 0)
  sqm: number | null;
  district: string | null;
}
