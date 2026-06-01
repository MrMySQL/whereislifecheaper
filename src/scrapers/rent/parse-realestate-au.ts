import { ListingRaw } from './types';

interface ReaCacheEntry {
  data?: string;
}

interface ReaListing {
  _links?: {
    canonical?: {
      href?: string;
      path?: string;
    };
  };
  address?: {
    suburb?: string;
  };
  generalFeatures?: {
    bedrooms?: { value?: number };
  };
  id?: string;
  price?: {
    display?: string;
  };
  propertySizes?: {
    building?: { display?: string; value?: number };
    preferred?: { display?: string; value?: number };
  };
}

function parseArgonautExchange(html: string): Record<string, unknown> | null {
  const marker = 'window.ArgonautExchange=';
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const jsonStart = start + marker.length;
  const raw = extractJsonObject(html, jsonStart);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectStart = -1;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (objectStart === -1) {
      if (ch === '{') objectStart = i;
      else if (!/\s/.test(ch)) return null;
      if (objectStart === -1) continue;
    }

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(objectStart, i + 1);
    }
  }

  return null;
}

function getRentSearchListings(exchange: Record<string, unknown> | null): ReaListing[] {
  const app = exchange?.['resi-property_listing-experience-web'] as { urqlClientCache?: string } | undefined;
  if (!app?.urqlClientCache) return [];

  let cache: Record<string, ReaCacheEntry>;
  try {
    cache = JSON.parse(app.urqlClientCache);
  } catch {
    return [];
  }

  const listings: ReaListing[] = [];
  for (const entry of Object.values(cache)) {
    if (!entry?.data) continue;
    let data: any;
    try {
      data = JSON.parse(entry.data);
    } catch {
      continue;
    }

    const items = data?.rentSearch?.results?.exact?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item?.listing) listings.push(item.listing);
    }
  }
  return listings;
}

function sqmText(listing: ReaListing): string | null {
  const size = listing.propertySizes?.building ?? listing.propertySizes?.preferred;
  if (size?.display) return size.display;
  if (typeof size?.value === 'number' && size.value > 0) return `${size.value} m²`;
  return null;
}

export function parseRealestateAuListPage(html: string): ListingRaw[] {
  const listings = getRentSearchListings(parseArgonautExchange(html));
  const out: ListingRaw[] = [];

  for (const listing of listings) {
    const url = listing._links?.canonical?.href;
    const priceText = listing.price?.display;
    if (!url || !priceText) continue;

    const bedrooms = listing.generalFeatures?.bedrooms?.value;
    const roomsText =
      typeof bedrooms === 'number'
        ? bedrooms === 0
          ? 'Studio'
          : `${bedrooms} ${bedrooms === 1 ? 'Bed' : 'Beds'}`
        : '';
    if (!roomsText) continue;

    out.push({
      source: 'realestateau',
      url,
      priceText,
      roomsText,
      sqmText: sqmText(listing),
      district: listing.address?.suburb ?? null,
      listedAtText: null,
    });
  }

  return out;
}
