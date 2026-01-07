/**
 * Type definitions for scrapers
 */

export interface ScraperConfig {
  supermarketId: number;
  name: string;
  baseUrl: string;
  categoryUrls: string[];
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
  supermarketId: number;
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
