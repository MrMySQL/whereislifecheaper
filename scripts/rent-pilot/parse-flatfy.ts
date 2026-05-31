import * as cheerio from 'cheerio';
import { ListingRaw } from './types';

const BASE = 'https://flatfy.ua';

/** Detect a DataDome / captcha interstitial instead of real listings. */
export function isDataDomeWall(html: string): boolean {
  return /captcha-delivery\.com/.test(html) || /\bDataDome\b/.test(html);
}

/**
 * Parse a flatfy.ua list page HTML into raw listings.
 * Pure function — no network, easy to unit test against a fixture.
 *
 * Real DOM (flatfy is server-rendered, lun.ua engine):
 *   - card:   `article.realty-preview` (carries the listing id as `id`)
 *   - info:   `.realty-preview-info` items render, in order, the room count
 *             ("1 кімната" / "2 кімнати"), the area triplet ("45 / 28 / 8 м²" —
 *             total area is first), the floor, etc.
 *   - price:  `.realty-preview-price--main` ("$ 541", shown in USD)
 *   - region: `.realty-preview-sub-title` links — complex ("ЖК ..."),
 *             micro-district, administrative district, city.
 *
 * There is NO `<a href>` to the detail page (title/price are <button>s; the only
 * card anchors are filter links), so the detail URL is built from the card id
 * (the page_id): `https://flatfy.ua/redirect/{id}`.
 */
export function parseFlatfyListPage(html: string): ListingRaw[] {
  if (isDataDomeWall(html)) return [];

  const $ = cheerio.load(html);
  const out: ListingRaw[] = [];

  $('article.realty-preview').each((_, el) => {
    const card = $(el);

    const id = card.attr('id');
    if (!id) return;
    const url = `${BASE}/redirect/${id}`;

    // Join the info items so roomsTextToBedrooms can read the "N кімната" count
    // ("1 кімната, 45 / 28 / 8 м², поверх 23 з 26, ...").
    const infoItems = card
      .find('.realty-preview-info')
      .map((__, e) => $(e).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);
    const roomsText = infoItems.join(', ');

    const priceText = card
      .find('.realty-preview-price--main')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    // Area: total area is the FIRST number before "м²" in the area triplet.
    const infoText = infoItems.join(' ');
    const areaMatch = infoText.match(/(\d+(?:[.,]\d+)?)\s*(?:\/[^м]*)?м²/);
    const sqmText = areaMatch ? `${areaMatch[1]} м²` : null;

    // District = the administrative-district sub-title link, identified by its
    // href containing "район" (raw Cyrillic or percent-encoded). Skip the
    // complex ("ЖК ..."), whose filter URL can ALSO contain the district slug.
    const subTitles = card.find('.realty-preview-sub-title');
    let district: string | null = null;
    subTitles.each((__, a) => {
      if (district) return;
      const text = $(a).text().replace(/\s+/g, ' ').trim();
      if (!text || /^ЖК\b/i.test(text)) return;
      const raw = $(a).attr('href') || '';
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        /* keep raw */
      }
      if (/район/.test(decoded)) {
        district = text;
      }
    });

    out.push({
      source: 'flatfy',
      url,
      priceText,
      roomsText,
      sqmText,
      district,
      listedAtText: null,
    });
  });

  return out;
}
