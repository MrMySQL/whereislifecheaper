/**
 * Type definitions for scrapers
 */

export interface CategoryConfig {
  id: string;       // e.g., 'beverages', 'dairy', 'meat'
  name: string;     // e.g., 'Beverages', 'Dairy Products', 'Meat & Fish'
  url: string;      // e.g., '/icecek-c-6'
}

export interface ScraperConfig {
  supermarketId: string;
  name: string;
  baseUrl: string;
  categories: CategoryConfig[];
  // Legacy support - will be converted to categories if present
  categoryUrls?: string[];
  selectors: ScraperSelectors;
  waitTimes: WaitTimes;
  headers?: Record<string, string>;
  cookies?: Array<{ name: string; value: string; domain?: string }>;
  maxRetries: number;
  concurrentPages: number;
  userAgents?: string[];
}

export interface ScraperSelectors {
  productCard: string;
  productName: string;
  productPrice: string;
  productImage?: string;
  productUrl?: string;
  productBrand?: string;
  productUnit?: string;
  productOriginalPrice?: string;
  productAvailability?: string;
  pagination?: string;
  nextPage?: string;
}

export interface WaitTimes {
  pageLoad: number;
  dynamicContent: number;
  betweenRequests: number;
  betweenPages?: number;
}

export interface ProductData {
  name: string;
  price: number;
  currency: string;
  originalPrice?: number;
  isOnSale: boolean;
  imageUrl?: string;
  productUrl: string;
  externalId?: string;
  brand?: string;
  unit?: string;
  unitQuantity?: number;
  description?: string;
  categoryName?: string;
  isAvailable: boolean;
}

export interface ScrapedProduct extends ProductData {
  normalizedName: string;
  pricePerUnit?: number;
}

export interface ScrapeResult {
  supermarketId: string;
  products: ScrapedProduct[];
  scrapedAt: Date;
  duration: number;
  productsScraped: number;
  productsFailed: number;
  errors: ScrapeError[];
}

export interface ScrapeError {
  productUrl?: string;
  message: string;
  stack?: string;
  timestamp: Date;
}

export enum ScrapeStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  PARTIAL = 'partial',
}

/**
 * Callback function called after each page is scraped
 * Allows saving products incrementally instead of all at once
 */
export type OnPageScrapedCallback = (products: ProductData[], pageInfo: PageInfo) => Promise<number>;

export interface PageInfo {
  categoryId: string;
  categoryName: string;
  pageNumber: number;
  totalProductsOnPage: number;
}
