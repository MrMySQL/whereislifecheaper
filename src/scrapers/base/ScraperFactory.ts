import { BaseScraper } from './BaseScraper';
import { ScraperConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { getScraperConfig } from '../../config/scrapers';

// Import scrapers as they're created
// Turkey
import { MigrosScraper } from '../turkey/MigrosScraper';
// import { A101Scraper } from '../turkey/A101Scraper';

// Montenegro
// import { VoliScraper } from '../montenegro/VoliScraper';

// Spain
// import { MercadonaScraper } from '../spain/MercadonaScraper';

// Uzbekistan
// import { KorzinkaScraper } from '../uzbekistan/KorzinkaScraper';

/**
 * Factory class for creating scraper instances
 */
export class ScraperFactory {
  private static scraperMap: Map<string, new (config: ScraperConfig) => BaseScraper> = new Map();

  /**
   * Register a scraper class
   */
  static register(className: string, scraperClass: new (config: ScraperConfig) => BaseScraper): void {
    ScraperFactory.scraperMap.set(className, scraperClass);
    scraperLogger.info(`Registered scraper: ${className}`);
  }

  /**
   * Create a scraper instance based on configuration
   */
  static create(config: ScraperConfig): BaseScraper {
    const ScraperClass = ScraperFactory.scraperMap.get(config.name);

    if (!ScraperClass) {
      const error = `Scraper not found for: ${config.name}. Available scrapers: ${Array.from(ScraperFactory.scraperMap.keys()).join(', ')}`;
      scraperLogger.error(error);
      throw new Error(error);
    }

    scraperLogger.info(`Creating scraper instance for: ${config.name}`);
    return new ScraperClass(config);
  }

  /**
   * Create a scraper from database supermarket record
   */
  static createFromSupermarket(supermarket: {
    id: string;
    name: string;
    website_url: string;
    scraper_class: string;
    scraper_config: any;
  }): BaseScraper {
    // Get the scraper class from the map
    const ScraperClass = ScraperFactory.scraperMap.get(supermarket.scraper_class);

    if (!ScraperClass) {
      const error = `Scraper class not found: ${supermarket.scraper_class} for ${supermarket.name}`;
      scraperLogger.error(error);
      throw new Error(error);
    }

    // Get default config from file
    const defaultConfig = getScraperConfig(supermarket.scraper_class) || {};
    const dbConfig = supermarket.scraper_config || {};

    // Merge database config with defaults (database overrides defaults)
    const config: ScraperConfig = {
      supermarketId: supermarket.id,
      name: supermarket.name,
      baseUrl: supermarket.website_url || defaultConfig.baseUrl || '',
      categoryUrls: dbConfig.categoryUrls || defaultConfig.categoryUrls || [],
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

    scraperLogger.info(`Creating scraper for supermarket: ${supermarket.name}`);
    return new ScraperClass(config);
  }

  /**
   * Get list of registered scrapers
   */
  static getRegisteredScrapers(): string[] {
    return Array.from(ScraperFactory.scraperMap.keys());
  }

  /**
   * Check if a scraper is registered
   */
  static isRegistered(className: string): boolean {
    return ScraperFactory.scraperMap.has(className);
  }
}

// Register scrapers here as they're implemented
ScraperFactory.register('MigrosScraper', MigrosScraper);
// ScraperFactory.register('A101Scraper', A101Scraper);
// ScraperFactory.register('VoliScraper', VoliScraper);
// ScraperFactory.register('MercadonaScraper', MercadonaScraper);
// ScraperFactory.register('KorzinkaScraper', KorzinkaScraper);

export default ScraperFactory;
