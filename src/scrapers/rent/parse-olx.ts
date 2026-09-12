import * as cheerio from 'cheerio';
import { ListingRaw } from './types';

// Selectors current as of 2026-05; verify against the fixture if a test fails.
const CARD_SELECTOR = '[data-cy="l-card"]';
const PRICE_SELECTOR = '[data-testid="ad-price"]';
const TITLE_SELECTOR = 'h4, h6';
const LOCATION_SELECTOR = '[data-testid="location-date"]';
const LINK_SELECTOR = 'a[href]';

interface OlxAttributes {
  roomsText?: string;
  sqmText?: string;
}

function canonicalUrl(href: string): string {
  return (href.startsWith('http') ? href : `https://www.olx.ua${href}`).split(/[?#]/)[0];
}

function parseStructuredListing(script: string): { attributes: Map<string, OlxAttributes>; empty: boolean } {
  const attributes = new Map<string, OlxAttributes>();
  const result = { attributes, empty: false };
  // OLX serializes its state as a JSON string assigned inside this script.
  // Decode the string and object with JSON.parse, never execute page scripts.
  const match = script.match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:\\.|[^"\\])*")/);
  if (!match) return result;
  try {
    const state = JSON.parse(JSON.parse(match[1]));
    const listing = state?.listing?.listing;
    const ads = listing?.ads;
    if (!Array.isArray(ads)) return result;
    result.empty = listing.totalElements === 0 && ads.length === 0;
    for (const ad of ads) {
      if (typeof ad?.url !== 'string' || !Array.isArray(ad.params)) continue;
      const values: OlxAttributes = {};
      for (const param of ad.params) {
        if (typeof param?.value !== 'string' || !param.value.trim()) continue;
        if (param.key === 'number_of_rooms_string') values.roomsText = param.value.trim();
        if (param.key === 'total_area') values.sqmText = param.value.trim();
      }
      attributes.set(canonicalUrl(ad.url), values);
    }
  } catch {
    // Card markup remains usable when OLX changes or omits its embedded state.
  }
  return result;
}

export function parseOlxListPage(html: string, requireListingEvidence = false): ListingRaw[] {
  const $ = cheerio.load(html);
  const { attributes, empty } = parseStructuredListing($('#olx-init-config').text());
  $('style, script').remove();
  const cards = $(CARD_SELECTOR);

  const listings: ListingRaw[] = [];

  cards.each((_, el) => {
    const card = $(el);

    const href = card.find(LINK_SELECTOR).first().attr('href') ?? '';
    if (!href) return;
    const url = canonicalUrl(href);
    const structured = attributes.get(url);

    const priceText = card.find(PRICE_SELECTOR).first().text().trim();
    const title = card.find(TITLE_SELECTOR).first().text().trim();
    if (!priceText || !title) return;

    const sqmMatch = title.match(/(\d+(?:[.,]\d+)?)\s*(?:м²|кв\.?\s*м|кв\.м|м2)/i);
    const sqmText = structured?.sqmText ?? (sqmMatch ? sqmMatch[0] : null);

    const locationDate = card.find(LOCATION_SELECTOR).first().text().trim();
    // Location is typically "Київ, Подільський - 30 травня 2026 р."
    const districtMatch = locationDate.match(/Київ,\s*([^-—]+?)\s*[-—]/);
    const district = districtMatch ? districtMatch[1].trim() : null;

    listings.push({
      source: 'olx',
      url,
      priceText,
      roomsText: structured?.roomsText ?? title,
      sqmText,
      district,
      listedAtText: locationDate || null,
    });
  });

  if (requireListingEvidence && listings.length === 0 && !empty) {
    throw new Error('no listings parsed and no explicit empty-results state');
  }
  return listings;
}
