import * as cheerio from 'cheerio';
import { ListingRaw } from './types';

// Selectors current as of 2026-05; verify against the fixture if a test fails.
const CARD_SELECTOR = '[data-cy="l-card"]';
const PRICE_SELECTOR = '[data-testid="ad-price"]';
const TITLE_SELECTOR = 'h4, h6';
const LOCATION_SELECTOR = '[data-testid="location-date"]';
const LINK_SELECTOR = 'a[href]';

export function parseOlxListPage(html: string): ListingRaw[] {
  const $ = cheerio.load(html);
  const cards = $(CARD_SELECTOR);

  const listings: ListingRaw[] = [];

  cards.each((_, el) => {
    const card = $(el);

    const href = card.find(LINK_SELECTOR).first().attr('href') ?? '';
    if (!href) return;
    const url = href.startsWith('http') ? href : `https://www.olx.ua${href}`;

    const priceText = card.find(PRICE_SELECTOR).first().text().trim();
    const title = card.find(TITLE_SELECTOR).first().text().trim();
    if (!priceText || !title) return;

    const sqmMatch = title.match(/(\d+(?:[.,]\d+)?)\s*(?:м²|кв\.?\s*м|кв\.м|м2)/i);
    const sqmText = sqmMatch ? sqmMatch[0] : null;

    const locationDate = card.find(LOCATION_SELECTOR).first().text().trim();
    // Location is typically "Київ, Подільський - 30 травня 2026 р."
    const districtMatch = locationDate.match(/Київ,\s*([^-—]+?)\s*[-—]/);
    const district = districtMatch ? districtMatch[1].trim() : null;

    listings.push({
      source: 'olx',
      url,
      priceText,
      roomsText: title,
      sqmText,
      district,
      listedAtText: locationDate || null,
    });
  });

  return listings;
}
