import { BaseScraper } from './BaseScraper';
import { ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { createPrefixedLogger } from '../../utils/logger';
import {
  getScraperRegistration,
  getScraperCategories,
  getScraperDefaultConfig,
  isScraperRegistered,
  getRegisteredScraperNames,
} from '../scraperRegistry';

export interface CreateScraperOptions {
  categoryIds?: string[];  // Filter to specific category IDs
}

const logger = createPrefixedLogger('Factory');

/**
 * Factory class for creating scraper instances.
 * Uses the central ScraperRegistry for all scraper metadata.
 */
export class ScraperFactory {
  /**
   * Create a scraper instance based on configuration
   */
  static create(config: ScraperConfig): BaseScraper {
    const registration = getScraperRegistration(config.name);

    if (!registration) {
      const available = getRegisteredScraperNames().join(', ');
      const error = `Scraper not found: ${config.name}. Available: ${available}`;
      logger.error(error);
      throw new Error(error);
    }

    logger.info(`Creating scraper instance: ${config.name}`);
    return new registration.scraperClass(config);
  }

  /**
   * Create a scraper from database supermarket record
   */
  static createFromSupermarket(
    supermarket: {
      id: string;
      name: string;
      website_url: string;
      scraper_class: string;
      scraper_config: any;
    },
    options?: CreateScraperOptions
  ): BaseScraper {
    const registration = getScraperRegistration(supermarket.scraper_class);

    if (!registration) {
      const error = `Scraper class not found: ${supermarket.scraper_class} for ${supermarket.name}`;
      logger.error(error);
      throw new Error(error);
    }

    // Get default config from registry
    const defaultConfig = registration.defaultConfig || {};
    const dbConfig = supermarket.scraper_config || {};

    // Get categories - prioritize database config, then default from registry
    let categories: CategoryConfig[] = dbConfig.categories || registration.categories || [];

    // Legacy support: convert categoryUrls to categories if needed
    if (categories.length === 0 && (dbConfig.categoryUrls || defaultConfig.categoryUrls)) {
      const urls = dbConfig.categoryUrls || defaultConfig.categoryUrls || [];
      categories = urls.map((url: string, index: number) => ({
        id: `category-${index}`,
        name: `Category ${index + 1}`,
        url,
      }));
    }

    // Filter categories if specified
    if (options?.categoryIds && options.categoryIds.length > 0) {
      const filteredCategories = categories.filter(cat =>
        options.categoryIds!.includes(cat.id)
      );

      if (filteredCategories.length === 0) {
        logger.warn(
          `No matching categories found for IDs: ${options.categoryIds.join(', ')}. ` +
          `Available: ${categories.map(c => c.id).join(', ')}`
        );
      } else {
        logger.info(
          `Filtering to categories: ${filteredCategories.map(c => c.name).join(', ')}`
        );
        categories = filteredCategories;
      }
    }

    // Merge database config with defaults (database overrides defaults)
    const config: ScraperConfig = {
      supermarketId: supermarket.id,
      name: supermarket.name,
      baseUrl: supermarket.website_url || defaultConfig.baseUrl || '',
      categories,
      selectors: {
        ...defaultConfig.selectors,
        ...dbConfig.selectors,
      } as ScraperConfig['selectors'],
      waitTimes: {
        pageLoad: 5000,
        dynamicContent: 2000,
        betweenRequests: 1000,
        ...defaultConfig.waitTimes,
        ...dbConfig.waitTimes,
      },
      headers: dbConfig.headers || defaultConfig.headers,
      cookies: dbConfig.cookies || defaultConfig.cookies,
      maxRetries: dbConfig.maxRetries || defaultConfig.maxRetries || 3,
      concurrentPages: dbConfig.concurrentPages || defaultConfig.concurrentPages || 2,
      userAgents: dbConfig.userAgents || defaultConfig.userAgents,
    };

    logger.info(`Creating scraper for supermarket: ${supermarket.name}`);
    return new registration.scraperClass(config);
  }

  /**
   * Get available categories for a scraper class
   */
  static getAvailableCategories(scraperClass: string): CategoryConfig[] {
    return getScraperCategories(scraperClass);
  }

  /**
   * Get default config for a scraper class
   */
  static getDefaultConfig(scraperClass: string): Partial<ScraperConfig> | undefined {
    return getScraperDefaultConfig(scraperClass);
  }

  /**
   * Get list of registered scrapers
   */
  static getRegisteredScrapers(): string[] {
    return getRegisteredScraperNames();
  }

  /**
   * Check if a scraper is registered
   */
  static isRegistered(className: string): boolean {
    return isScraperRegistered(className);
  }
}

export default ScraperFactory;
