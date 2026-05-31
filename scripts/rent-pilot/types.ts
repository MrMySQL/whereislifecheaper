export type Source = 'olx' | 'domria' | 'flatfy';

export interface ListingRaw {
  source: Source;
  url: string;
  priceText: string;
  roomsText: string;
  sqmText: string | null;
  district: string | null;
  listedAtText: string | null;
}

export type Currency = 'UAH' | 'USD' | 'EUR';

export interface ListingNormalized {
  source: Source;
  url: string;
  priceLocal: number;
  currency: Currency;
  priceUsd: number;
  bedrooms: number;
  sqm: number | null;
  district: string | null;
}

export interface BucketStats {
  source: Source;
  bedrooms: number;
  nListings: number;
  nDropped: number;
  medianUsd: number;
  medianLocal: number;
  p25Usd: number;
  p75Usd: number;
}
