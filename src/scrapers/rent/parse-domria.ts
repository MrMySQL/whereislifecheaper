import * as cheerio from 'cheerio';
import { ListingRaw } from './types';

// Selectors current as of 2026-05; verify against the fixture if tests fail.
const CARD_SELECTOR = 'section.realty-item';
const CHAR_SELECTOR = '.realty-char span.point-before';
const LINK_SELECTOR = 'a.realty-link, a[href*="/uk/realty"]';
const DISTRICT_SELECTOR = 'a[data-level="area"]';
const PRICE_TAG_REGEX = /грн|usd|\$|€|eur/i;

export function parseDomriaListPage(html: string): ListingRaw[] {
  const $ = cheerio.load(html);
  const cards = $(CARD_SELECTOR);

  const listings: ListingRaw[] = [];

  cards.each((_, el) => {
    const card = $(el);

    // Price: first <b> whose text contains a currency token.
    const priceEl = card
      .find('b')
      .filter((_, b) => PRICE_TAG_REGEX.test($(b).text()))
      .first();
    const priceText = priceEl.text().trim();

    const chars = card.find(CHAR_SELECTOR);
    // Characteristics order: [rooms, area, floor]. Find rooms by content.
    let roomsText = '';
    let sqmText: string | null = null;
    chars.each((_, c) => {
      const t = $(c).text().trim();
      if (!roomsText && /кімн|студ/i.test(t)) roomsText = t;
      else if (!sqmText && /м²|м2/i.test(t)) sqmText = t;
    });

    const href = card.find(LINK_SELECTOR).first().attr('href') ?? '';
    if (!href) return;
    const url = href.startsWith('http') ? href : `https://dom.ria.com${href}`;

    // District: pick the last data-level=area which is the city district
    // (earlier ones are sub-areas / neighborhoods).
    const districtNodes = card.find(DISTRICT_SELECTOR);
    const district = districtNodes.length
      ? districtNodes.last().text().trim()
      : null;

    if (!priceText || !roomsText) return;

    listings.push({
      source: 'domria',
      url,
      priceText,
      roomsText,
      sqmText,
      district,
      listedAtText: null,
    });
  });

  return listings;
}
