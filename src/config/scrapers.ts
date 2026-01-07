import { ScraperConfig } from '../types/scraper.types';

/**
 * Default scraper configurations
 * These can be overridden by database configurations
 */

export const migrosConfig: Partial<ScraperConfig> = {
  name: 'Migros',
  baseUrl: 'https://www.migros.com.tr',
  categoryUrls: [
    '/meyve-sebze-c-2',
    '/et-tavuk-balik-c-3',
    '/sut-kahvaltilik-c-4',
    '/temel-gida-c-5',
    '/icecek-c-6',
    '/atistirmalik-c-7',
    '/donuk-gida-c-8',
  ],
  selectors: {
    productCard: 'mat-card',
    productName: 'img.product-image',  // Use alt attribute for name
    productPrice: '.price-container',
    productImage: 'img.product-image',
    productUrl: 'a[href*="-p-"]',
    productBrand: '.brand',
    productOriginalPrice: '.old-price',
    pagination: 'button[aria-label*="sayfa"]',
    nextPage: 'button[aria-label="Sonraki sayfa"]',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 3000,
    betweenRequests: 1500,
    betweenPages: 3000,
  },
  maxRetries: 3,
  concurrentPages: 2,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

export const a101Config: Partial<ScraperConfig> = {
  name: 'A101',
  baseUrl: 'https://www.a101.com.tr',
  categoryUrls: [
    '/market/meyve-sebze',
    '/market/et-tavuk-balik',
    '/market/sut-urunleri',
  ],
  selectors: {
    productCard: '.product-item',
    productName: '.product-title',
    productPrice: '.price-tag',
    productImage: '.product-image img',
    productUrl: 'a',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 2000,
    betweenRequests: 1500,
  },
  maxRetries: 3,
  concurrentPages: 2,
};

export const voliConfig: Partial<ScraperConfig> = {
  name: 'Voli',
  baseUrl: 'https://voli.me',
  categoryUrls: [
    // Fresh fruits and vegetables subcategories
    '/kategorije/146',  // Voće (Fruits)
    '/kategorije/147',  // Povrće (Vegetables)
    '/kategorije/148',  // Organsko voće i povrće
    '/kategorije/149',  // Pečurke
    '/kategorije/152',  // Zimnica
    // Dairy
    '/kategorije/5',    // Mliječni proizvodi
    // Meat
    '/kategorije/6',    // Meso
  ],
  selectors: {
    productCard: 'a[href*="/proizvod/"]',
    productName: 'img',  // Use alt attribute for name
    productPrice: '.price',
    productImage: 'img',
    productUrl: 'a[href*="/proizvod/"]',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 3000,
    betweenRequests: 2000,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

export const mercadonaConfig: Partial<ScraperConfig> = {
  name: 'Mercadona',
  baseUrl: 'https://www.mercadona.es',
  categoryUrls: [
    '/frutas-y-verduras',
    '/carne-y-pescado',
    '/lacteos',
  ],
  selectors: {
    productCard: '.product-cell',
    productName: '.product-title',
    productPrice: '.product-price',
    productImage: '.product-image img',
    productUrl: 'a',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 2000,
    betweenRequests: 1500,
  },
  maxRetries: 3,
  concurrentPages: 2,
};

export const korzinkaConfig: Partial<ScraperConfig> = {
  name: 'Korzinka',
  baseUrl: 'https://korzinka.uz',
  categoryUrls: [
    '/mevalar-va-sabzavotlar',
    '/go-sht-va-baliq',
    '/sut-mahsulotlari',
  ],
  selectors: {
    productCard: '.product-card',
    productName: '.product-name',
    productPrice: '.product-price',
    productImage: '.product-image img',
    productUrl: 'a',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 2000,
    betweenRequests: 1500,
  },
  maxRetries: 3,
  concurrentPages: 2,
};

/**
 * Get default configuration for a scraper by name
 */
export function getScraperConfig(name: string): Partial<ScraperConfig> | undefined {
  const configs: Record<string, Partial<ScraperConfig>> = {
    MigrosScraper: migrosConfig,
    A101Scraper: a101Config,
    VoliScraper: voliConfig,
    MercadonaScraper: mercadonaConfig,
    KorzinkaScraper: korzinkaConfig,
  };

  return configs[name];
}
