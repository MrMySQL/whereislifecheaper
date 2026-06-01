import { ListingRaw } from './types';

const BASE = 'https://www.domain.com.au';

interface DomainListing {
  id?: number | string;
  listingModel?: {
    address?: {
      state?: string;
      street?: string;
      suburb?: string;
    };
    features?: {
      beds?: number;
      buildingSize?: number;
      propertyTypeFormatted?: string;
    };
    price?: string;
    url?: string;
  };
}

function absoluteUrl(url: string): string {
  return url.startsWith('http') ? url : `${BASE}${url}`;
}

function getListingMap(data: unknown): DomainListing[] {
  const componentProps =
    (data as any)?.props?.pageProps?.componentProps ??
    (data as any)?.props?.pageProps?.componentProps?.componentProps;
  const ids = componentProps?.listingSearchResultIds;
  const listingsMap = componentProps?.listingsMap;
  if (!Array.isArray(ids) || !listingsMap || typeof listingsMap !== 'object') return [];
  return ids.map((id) => listingsMap[String(id)]).filter(Boolean);
}

export function parseDomainAuListPage(html: string): ListingRaw[] {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const out: ListingRaw[] = [];
  for (const item of getListingMap(data)) {
    const listing = item.listingModel;
    if (!listing?.url || !listing.price) continue;

    const beds = listing.features?.beds;
    const roomsText =
      typeof beds === 'number'
        ? beds === 0
          ? 'Studio'
          : `${beds} ${beds === 1 ? 'Bed' : 'Beds'}`
        : '';
    if (!roomsText) continue;

    const sqm =
      typeof listing.features?.buildingSize === 'number' && listing.features.buildingSize > 0
        ? `${listing.features.buildingSize} m²`
        : null;

    out.push({
      source: 'domainau',
      url: absoluteUrl(listing.url),
      priceText: listing.price,
      roomsText,
      sqmText: sqm,
      district: listing.address?.suburb ?? null,
      listedAtText: null,
    });
  }

  return out;
}
