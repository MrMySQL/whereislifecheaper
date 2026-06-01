export type Source = 'olx' | 'domria' | 'flatfy' | 'realestateau' | 'domainau';

export type Currency = 'UAH' | 'USD' | 'EUR' | 'AUD';

/** Raw listing as scraped from a list page (pre-normalization). */
export interface ListingRaw {
  source: Source;
  url: string;
  priceText: string;
  roomsText: string;       // either rooms text ("2 кімнати") or bedroom text ("2 Beds")
  sqmText: string | null;
  district: string | null;
  listedAtText: string | null;
}

/** A listing normalized for persistence, priced in the country's own currency. */
export interface RentListingNormalized {
  source: Source;
  url: string;
  sourceListingId: string;
  priceOriginal: number;  // monthly rent in the listed currency
  currencyOriginal: Currency;
  priceLocal: number;     // monthly rent converted to the country's currency
  bedrooms: number;       // normalized bedroom count (studio = 0)
  sqm: number | null;
  district: string | null;
}
