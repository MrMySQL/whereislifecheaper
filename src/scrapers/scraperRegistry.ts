import { ScraperConfig, CategoryConfig } from '../types/scraper.types';
import { BaseScraper } from './base/BaseScraper';
import { MigrosScraper, migrosConfig, migrosCategories } from './turkey/MigrosScraper';
import { VoliScraper, voliConfig, voliCategories } from './montenegro/VoliScraper';
import { MercadonaScraper, mercadonaConfig, mercadonaCategories } from './spain/MercadonaScraper';
import { AuchanUaScraper, auchanUaConfig, auchanUaCategories } from './ukraine/AuchanUaScraper';
import { AuchanUaGraphQLScraper, auchanUaGraphQLConfig, auchanUaGraphQLCategories } from './ukraine/AuchanUaGraphQLScraper';
import { MakroScraper, makroConfig, makroCategories } from './uzbekistan/MakroScraper';
import { ArbuzScraper, arbuzConfig, arbuzCategories } from './kazakhstan/ArbuzScraper';
import { ReweScraper, reweConfig, reweCategories } from './germany/ReweScraper';
import { KnusprScraper, knusprConfig, knusprCategories } from './germany/KnusprScraper';
import { LotussScraper, lotussConfig, lotussCategories } from './malaysia/LotussScraper';
import { LotussApiScraper, lotussApiConfig, lotussApiCategories } from './malaysia/LotussApiScraper';
import { SparAlbaniaScraper, sparAlbaniaConfig, sparAlbaniaCategories } from './albania/SparAlbaniaScraper';
import { GurkeralScraper, gurkeralConfig, gurkeralCategories } from './austria/GurkeralScraper';
import { AuchanMoscowScraper, auchanMoscowConfig, auchanMoscowCategories } from './russia/AuchanMoscowScraper';

/**
 * Scraper registration entry containing all metadata for a scraper
 */
export interface ScraperRegistration {
  /** Class name used in database and factory */
  className: string;
  /** The scraper class constructor */
  scraperClass: new (config: ScraperConfig) => BaseScraper;
  /** Default configuration for this scraper */
  defaultConfig: Partial<ScraperConfig>;
  /** Available categories for this scraper */
  categories: CategoryConfig[];
}

/**
 * Central registry of all available scrapers.
 *
 * To add a new scraper:
 * 1. Import the scraper class and its config/categories
 * 2. Add an entry to this map
 *
 * That's it! Factory, test scripts, and API will automatically work.
 */
export const SCRAPER_REGISTRY: Map<string, ScraperRegistration> = new Map([
  [
    'MigrosScraper',
    {
      className: 'MigrosScraper',
      scraperClass: MigrosScraper,
      defaultConfig: migrosConfig,
      categories: migrosCategories,
    },
  ],
  [
    'VoliScraper',
    {
      className: 'VoliScraper',
      scraperClass: VoliScraper,
      defaultConfig: voliConfig,
      categories: voliCategories,
    },
  ],
  [
    'MercadonaScraper',
    {
      className: 'MercadonaScraper',
      scraperClass: MercadonaScraper,
      defaultConfig: mercadonaConfig,
      categories: mercadonaCategories,
    },
  ],
  [
    'AuchanUaScraper',
    {
      className: 'AuchanUaScraper',
      scraperClass: AuchanUaScraper,
      defaultConfig: auchanUaConfig,
      categories: auchanUaCategories,
    },
  ],
  [
    'AuchanUaGraphQLScraper',
    {
      className: 'AuchanUaGraphQLScraper',
      scraperClass: AuchanUaGraphQLScraper,
      defaultConfig: auchanUaGraphQLConfig,
      categories: auchanUaGraphQLCategories,
    },
  ],
  [
    'MakroScraper',
    {
      className: 'MakroScraper',
      scraperClass: MakroScraper,
      defaultConfig: makroConfig,
      categories: makroCategories,
    },
  ],
  [
    'ArbuzScraper',
    {
      className: 'ArbuzScraper',
      scraperClass: ArbuzScraper,
      defaultConfig: arbuzConfig,
      categories: arbuzCategories,
    },
  ],
  [
    'ReweScraper',
    {
      className: 'ReweScraper',
      scraperClass: ReweScraper,
      defaultConfig: reweConfig,
      categories: reweCategories,
    },
  ],
  [
    'KnusprScraper',
    {
      className: 'KnusprScraper',
      scraperClass: KnusprScraper,
      defaultConfig: knusprConfig,
      categories: knusprCategories,
    },
  ],
  [
    'LotussScraper',
    {
      className: 'LotussScraper',
      scraperClass: LotussScraper,
      defaultConfig: lotussConfig,
      categories: lotussCategories,
    },
  ],
  [
    'LotussApiScraper',
    {
      className: 'LotussApiScraper',
      scraperClass: LotussApiScraper,
      defaultConfig: lotussApiConfig,
      categories: lotussApiCategories,
    },
  ],
  [
    'SparAlbaniaScraper',
    {
      className: 'SparAlbaniaScraper',
      scraperClass: SparAlbaniaScraper,
      defaultConfig: sparAlbaniaConfig,
      categories: sparAlbaniaCategories,
    },
  ],
  [
    'GurkeralScraper',
    {
      className: 'GurkeralScraper',
      scraperClass: GurkeralScraper,
      defaultConfig: gurkeralConfig,
      categories: gurkeralCategories,
    },
  ],
  [
    'AuchanMoscowScraper',
    {
      className: 'AuchanMoscowScraper',
      scraperClass: AuchanMoscowScraper,
      defaultConfig: auchanMoscowConfig,
      categories: auchanMoscowCategories,
    },
  ],
]);

/**
 * Get registration for a specific scraper by class name
 */
export function getScraperRegistration(className: string): ScraperRegistration | undefined {
  return SCRAPER_REGISTRY.get(className);
}

/**
 * Get all registered scrapers
 */
export function getAllScraperRegistrations(): ScraperRegistration[] {
  return Array.from(SCRAPER_REGISTRY.values());
}

/**
 * Get available categories for a scraper
 */
export function getScraperCategories(className: string): CategoryConfig[] {
  return SCRAPER_REGISTRY.get(className)?.categories || [];
}

/**
 * Get default config for a scraper
 */
export function getScraperDefaultConfig(className: string): Partial<ScraperConfig> | undefined {
  return SCRAPER_REGISTRY.get(className)?.defaultConfig;
}

/**
 * Check if a scraper is registered
 */
export function isScraperRegistered(className: string): boolean {
  return SCRAPER_REGISTRY.has(className);
}

/**
 * Get list of all registered scraper names
 */
export function getRegisteredScraperNames(): string[] {
  return Array.from(SCRAPER_REGISTRY.keys());
}
