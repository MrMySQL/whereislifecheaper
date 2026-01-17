import { query } from '../index';

export interface SupermarketSeedData {
  country_code: string;
  name: string;
  website_url: string;
  scraper_class: string;
  is_active: boolean;
}

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
