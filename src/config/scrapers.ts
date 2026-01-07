import { ScraperConfig, CategoryConfig } from '../types/scraper.types';

/**
 * Default scraper configurations
 * These can be overridden by database configurations
 */

export const migrosCategories: CategoryConfig[] = [
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', url: '/meyve-sebze-c-2' },
  { id: 'meat-fish', name: 'Meat, Chicken & Fish', url: '/et-tavuk-balik-c-3' },
  { id: 'dairy', name: 'Dairy & Breakfast', url: '/sut-kahvaltilik-c-4' },
  { id: 'staples', name: 'Staple Foods', url: '/temel-gida-c-5' },
  { id: 'beverages', name: 'Beverages', url: '/icecek-c-6' },
  { id: 'snacks', name: 'Snacks', url: '/atistirmalik-c-7' },
  { id: 'frozen', name: 'Frozen Foods', url: '/donuk-gida-c-8' },
];

export const migrosConfig: Partial<ScraperConfig> = {
  name: 'Migros',
  baseUrl: 'https://www.migros.com.tr',
  categories: migrosCategories,
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

export const a101Categories: CategoryConfig[] = [
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', url: '/market/meyve-sebze' },
  { id: 'meat-fish', name: 'Meat, Chicken & Fish', url: '/market/et-tavuk-balik' },
  { id: 'dairy', name: 'Dairy Products', url: '/market/sut-urunleri' },
];

export const a101Config: Partial<ScraperConfig> = {
  name: 'A101',
  baseUrl: 'https://www.a101.com.tr',
  categories: a101Categories,
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

export const voliCategories: CategoryConfig[] = [
  { id: 'fruits', name: 'Fruits', url: '/kategorije/146' },
  { id: 'vegetables', name: 'Vegetables', url: '/kategorije/147' },
  { id: 'organic', name: 'Organic Fruits & Vegetables', url: '/kategorije/148' },
  { id: 'mushrooms', name: 'Mushrooms', url: '/kategorije/149' },
  { id: 'preserved', name: 'Preserved Foods', url: '/kategorije/152' },
  { id: 'dairy', name: 'Dairy Products', url: '/kategorije/5' },
  { id: 'meat', name: 'Meat', url: '/kategorije/6' },
];

export const voliConfig: Partial<ScraperConfig> = {
  name: 'Voli',
  baseUrl: 'https://voli.me',
  categories: voliCategories,
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

export const mercadonaCategories: CategoryConfig[] = [
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', url: '/frutas-y-verduras' },
  { id: 'meat-fish', name: 'Meat & Fish', url: '/carne-y-pescado' },
  { id: 'dairy', name: 'Dairy', url: '/lacteos' },
];

export const mercadonaConfig: Partial<ScraperConfig> = {
  name: 'Mercadona',
  baseUrl: 'https://www.mercadona.es',
  categories: mercadonaCategories,
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

export const korzinkaCategories: CategoryConfig[] = [
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', url: '/mevalar-va-sabzavotlar' },
  { id: 'meat-fish', name: 'Meat & Fish', url: '/go-sht-va-baliq' },
  { id: 'dairy', name: 'Dairy Products', url: '/sut-mahsulotlari' },
];

export const korzinkaConfig: Partial<ScraperConfig> = {
  name: 'Korzinka',
  baseUrl: 'https://korzinka.uz',
  categories: korzinkaCategories,
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

/**
 * Get available categories for a scraper
 */
export function getScraperCategories(name: string): CategoryConfig[] {
  const categories: Record<string, CategoryConfig[]> = {
    MigrosScraper: migrosCategories,
    A101Scraper: a101Categories,
    VoliScraper: voliCategories,
    MercadonaScraper: mercadonaCategories,
    KorzinkaScraper: korzinkaCategories,
  };

  return categories[name] || [];
}
