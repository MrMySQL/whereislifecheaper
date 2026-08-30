import { query } from '../index';

export interface SupermarketSeedData {
  country_code: string;
  name: string;
  website_url: string;
  scraper_class: string;
  is_active: boolean;
}

/**
 * Seed data for supermarkets.
 *
 * This file is the source of truth for `is_active` — the scrape workflow runs
 * `npm run seed` before every run, so the upsert below resets it each time.
 *
 * Several entries here are placeholders whose scraper_class has no
 * implementation in SCRAPER_REGISTRY: A101Scraper, BIMScraper, SokScraper,
 * CarrefourTurkeyScraper, IdeaScraper, CarrefourSpainScraper, AlcampoScraper,
 * DiaScraper and KorzinkaScraper. They are all is_active: false
 * and harmless while they stay that way — enabling one makes
 * ScraperFactory.createFromSupermarket throw `Scraper class not found`, which
 * is caught and logged as a failed run every single time it is scheduled
 * (Uzum Market did exactly this daily through February 2026). Write the
 * scraper and register it before flipping any of them on.
 */
export const supermarketsData: SupermarketSeedData[] = [
  // Turkey
  {
    country_code: 'TR',
    name: 'Migros',
    website_url: 'https://www.migros.com.tr',
    scraper_class: 'MigrosScraper',
    is_active: true,
  },
  {
    country_code: 'TR',
    name: 'A101',
    website_url: 'https://www.a101.com.tr',
    scraper_class: 'A101Scraper',
    is_active: false,
  },
  {
    country_code: 'TR',
    name: 'BIM',
    website_url: 'https://www.bim.com.tr',
    scraper_class: 'BIMScraper',
    is_active: false,
  },
  {
    country_code: 'TR',
    name: 'ŞOK',
    website_url: 'https://www.sokmarket.com.tr',
    scraper_class: 'SokScraper',
    is_active: false,
  },
  {
    country_code: 'TR',
    name: 'CarrefourSA',
    website_url: 'https://www.carrefoursa.com',
    scraper_class: 'CarrefourTurkeyScraper',
    is_active: false,
  },
  // Montenegro
  {
    country_code: 'ME',
    name: 'Voli',
    website_url: 'https://voli.me',
    scraper_class: 'VoliScraper',
    is_active: true,
  },
  {
    country_code: 'ME',
    name: 'Idea',
    website_url: 'https://www.idea.co.me',
    scraper_class: 'IdeaScraper',
    is_active: false,
  },
  // Spain
  {
    country_code: 'ES',
    name: 'Mercadona',
    website_url: 'https://tienda.mercadona.es',
    scraper_class: 'MercadonaScraper',
    is_active: true,
  },
  {
    country_code: 'ES',
    name: 'Carrefour',
    website_url: 'https://www.carrefour.es',
    scraper_class: 'CarrefourSpainScraper',
    is_active: false,
  },
  {
    country_code: 'ES',
    name: 'Alcampo',
    website_url: 'https://www.alcampo.es',
    scraper_class: 'AlcampoScraper',
    is_active: false,
  },
  {
    country_code: 'ES',
    name: 'Dia',
    website_url: 'https://www.dia.es',
    scraper_class: 'DiaScraper',
    is_active: false,
  },
  // Uzbekistan
  {
    country_code: 'UZ',
    name: 'Korzinka',
    website_url: 'https://korzinka.uz',
    scraper_class: 'KorzinkaScraper',
    is_active: false,
  },
  {
    country_code: 'UZ',
    name: 'Makro',
    website_url: 'https://eats.yandex.com/uz/retail/makro',
    scraper_class: 'MakroScraper',
    is_active: true,
  },
  // Ukraine
  {
    country_code: 'UA',
    name: 'Auchan',
    website_url: 'https://auchan.ua',
    scraper_class: 'AuchanUaScraper',
    is_active: false, // Disabled - use GraphQL scraper instead
  },
  {
    country_code: 'UA',
    name: 'Auchan Express',
    website_url: 'https://express.auchan.ua',
    scraper_class: 'AuchanUaGraphQLScraper',
    is_active: true,
  },
  // Kazakhstan
  {
    country_code: 'KZ',
    name: 'Arbuz',
    website_url: 'https://arbuz.kz',
    scraper_class: 'ArbuzScraper',
    is_active: true,
  },
  // Germany
  // NOTE: REWE uses stealth mode (playwright-extra) to bypass Cloudflare
  // DISABLED 2026-08-31: the scraper's delivery-market selection silently
  // fails, so every product reads as location-dependent and is dropped. It
  // paginated 1,919 pages for 0 products on the 2026-08-01 run, burning 4h43m
  // (79% of the CI budget). Last price actually stored: 2026-05-04.
  // Germany is still covered by Knuspr. Re-enable once market selection works.
  {
    country_code: 'DE',
    name: 'REWE',
    website_url: 'https://www.rewe.de/shop/',
    scraper_class: 'ReweScraper',
    is_active: false,
  },
  {
    country_code: 'DE',
    name: 'Knuspr',
    website_url: 'https://www.knuspr.de',
    scraper_class: 'KnusprScraper',
    is_active: true,
  },
  // Malaysia
  {
    country_code: 'MY',
    name: "Lotuss",
    website_url: 'https://www.lotuss.com.my',
    scraper_class: 'LotussApiScraper',
    is_active: true,
  },
  // Albania
  {
    country_code: 'AL',
    name: 'SPAR Albania',
    website_url: 'https://shop.spar.al',
    scraper_class: 'SparAlbaniaScraper',
    is_active: true,
  },
  {
    country_code: 'AL',
    name: 'Wolt Bela Fruta',
    website_url: 'https://wolt.com/en/alb/tirana/venue/bela-fruta',
    scraper_class: 'WoltBelaFrutaScraper',
    is_active: true,
  },
  {
    country_code: 'AL',
    name: 'Wolt Eco Market Kika',
    website_url: 'https://wolt.com/en/alb/tirana/venue/eco-market-kika',
    scraper_class: 'WoltEcoMarketKikaScraper',
    is_active: true,
  },
  // Austria
  {
    country_code: 'AT',
    name: 'Gurkerl',
    website_url: 'https://www.gurkerl.at',
    scraper_class: 'GurkeralScraper',
    is_active: true,
  },
  // Russia
  {
    country_code: 'RU',
    name: 'Auchan Moscow',
    website_url: 'https://eda.yandex.ru/retail/asan_giper?placeSlug=ashan_g4zvs',
    scraper_class: 'AuchanMoscowScraper',
    is_active: true,
  },
  // Vietnam
  {
    country_code: 'VN',
    name: 'Annam Gourmet',
    website_url: 'https://shop.annam-gourmet.com/hn-xd',
    scraper_class: 'AnnamGourmetScraper',
    is_active: true,
  },
  {
    country_code: 'VN',
    name: 'Organica',
    website_url: 'https://www.organica.vn',
    scraper_class: 'OrganicaScraper',
    is_active: false,
  },
  {
    country_code: 'VN',
    name: 'WinMart',
    website_url: 'https://winmart.vn',
    scraper_class: 'WinMartScraper',
    is_active: true,
  },
  // Romania
  {
    country_code: 'RO',
    name: 'Sezamo',
    website_url: 'https://www.sezamo.ro',
    scraper_class: 'SezamoScraper',
    is_active: true,
  },
  // Italy
  {
    country_code: 'IT',
    name: 'Carrefour',
    website_url: 'https://www.carrefour.it',
    scraper_class: 'CarrefourItScraper',
    is_active: true,
  },
  // Australia
  // NOTE: Woolworths uses Akamai Bot Manager - run headed (PLAYWRIGHT_HEADLESS=false / xvfb) to bypass.
  {
    country_code: 'AU',
    name: 'Woolworths',
    website_url: 'https://www.woolworths.com.au',
    scraper_class: 'WoolworthsScraper',
    is_active: true,
  },
];

export async function seedSupermarkets(): Promise<void> {
  console.log('Seeding supermarkets...');

  for (const supermarket of supermarketsData) {
    // Get country_id from country_code
    const countryResult = await query(
      'SELECT id FROM countries WHERE code = $1',
      [supermarket.country_code]
    );

    if (countryResult.rows.length === 0) {
      console.error(`Country ${supermarket.country_code} not found`);
      continue;
    }

    const countryId = countryResult.rows[0].id;

    // This file is the source of truth for is_active: the CI workflow runs
    // `npm run seed` immediately before every scrape, so this upsert resets it
    // on each run. Anything done with `npm run scraper:toggle` is therefore
    // temporary — to disable a scraper durably, set is_active here.
    await query(
      `INSERT INTO supermarkets (country_id, name, website_url, scraper_class, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (country_id, name) DO UPDATE
       SET website_url = EXCLUDED.website_url,
           scraper_class = EXCLUDED.scraper_class,
           is_active = EXCLUDED.is_active`,
      [countryId, supermarket.name, supermarket.website_url, supermarket.scraper_class, supermarket.is_active]
    );
    console.log(`✓ Seeded supermarket: ${supermarket.name} (${supermarket.country_code})`);
  }

  console.log('Supermarkets seeded successfully');
}
