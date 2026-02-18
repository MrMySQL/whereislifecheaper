export { ProductRepository } from './ProductRepository';
export { ProductMappingRepository } from './ProductMappingRepository';
export { PriceRepository } from './PriceRepository';
export { SupermarketRepository } from './SupermarketRepository';
export { ScrapeLogRepository } from './ScrapeLogRepository';
export { CanonicalProductRepository } from './CanonicalProductRepository';
export { ExchangeRateRepository } from './ExchangeRateRepository';

// Singleton instances — import these in services and routes
import { ProductRepository } from './ProductRepository';
import { ProductMappingRepository } from './ProductMappingRepository';
import { PriceRepository } from './PriceRepository';
import { SupermarketRepository } from './SupermarketRepository';
import { ScrapeLogRepository } from './ScrapeLogRepository';
import { CanonicalProductRepository } from './CanonicalProductRepository';
import { ExchangeRateRepository } from './ExchangeRateRepository';

export const productRepository = new ProductRepository();
export const productMappingRepository = new ProductMappingRepository();
export const priceRepository = new PriceRepository();
export const supermarketRepository = new SupermarketRepository();
export const scrapeLogRepository = new ScrapeLogRepository();
export const canonicalProductRepository = new CanonicalProductRepository();
export const exchangeRateRepository = new ExchangeRateRepository();
