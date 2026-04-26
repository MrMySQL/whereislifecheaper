import { ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { WoltVenueScraper, woltAlbaniaBaseConfig } from './WoltVenueScraper';

/**
 * Wolt Bela Fruta categories configuration
 * Categories from https://wolt.com/en/alb/tirana/venue/bela-fruta
 */
export const woltBelaFrutaCategories: CategoryConfig[] = [
  { id: 'ekskluzive-1', name: 'EKSKLUZIVE', url: '/items/ekskluzive-1' },
  { id: 'ekzotike-2', name: 'EKZOTIKE', url: '/items/ekzotike-2' },
  { id: 'fruta-3', name: 'FRUTA', url: '/items/fruta-3' },
  { id: 'fruta-te-thata-5', name: 'FRUTA TE THATA', url: '/items/fruta-te-thata-5' },
  { id: 'bio-fshati-6', name: 'BIO FSHATI', url: '/items/bio-fshati-6' },
  { id: 'perime-7', name: 'PERIME', url: '/items/perime-7' },
  { id: 'produkte-8', name: 'PRODUKTE', url: '/items/produkte-8' },
  { id: 'pije-9', name: 'PIJE', url: '/items/pije-9' },
  { id: 'snacks-10', name: 'SNACKS', url: '/items/snacks-10' },
  // { id: 'alkolike-11', name: 'ALKOLIKE', url: '/items/alkolike-11' },
  { id: 'fruta-te-prera-12', name: 'FRUTA TE PRERA', url: '/items/fruta-te-prera-12' },
  { id: 'seeds-13', name: 'SEEDS', url: '/items/seeds-13' },
  { id: 'ereza-14', name: 'ERËZA', url: '/items/ereza-14' },
  { id: 'perime-te-prera-15', name: 'PERIME TE PRERA', url: '/items/perime-te-prera-15' },
];

export const woltBelaFrutaConfig: Partial<ScraperConfig> = {
  name: 'Wolt Bela Fruta',
  baseUrl: 'https://wolt.com/en/alb/tirana/venue/bela-fruta',
  categories: woltBelaFrutaCategories,
  ...woltAlbaniaBaseConfig,
};

export class WoltBelaFrutaScraper extends WoltVenueScraper {
  protected readonly venueSlug = 'bela-fruta';

  constructor(config: ScraperConfig) {
    super(config);
  }
}
