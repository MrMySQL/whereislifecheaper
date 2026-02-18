import { ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { WoltVenueScraper } from './WoltVenueScraper';

/**
 * Wolt Eco Market Kika categories configuration
 * Categories from https://wolt.com/en/alb/tirana/venue/eco-market-kika
 */
export const woltEcoMarketKikaCategories: CategoryConfig[] = [
  { id: 'ushqimore-1', name: 'Ushqimore', url: '/items/ushqimore-1' },
  { id: 'bulmet-veze-13', name: 'Bulmet & Vezë', url: '/items/bulmet-veze-13' },
  { id: 'kos-26', name: 'Kos', url: '/items/kos-26' },
  { id: 'konserva-36', name: 'Konserva', url: '/items/konserva-36' },
  { id: 'buke-dhe-brumera-40', name: 'Bukë dhe Brumëra', url: '/items/buke-dhe-brumera-40' },
  { id: 'mengjesi-44', name: 'Mëngjesi', url: '/items/mengjesi-44' },
  { id: 'banaku-i-fresket-49', name: 'Banaku i Freskët', url: '/items/banaku-i-fresket-49' },
  { id: 'proshute-sallamra-te-paketuar-51', name: 'Proshutë & Sallamra të Paketuar', url: '/items/proshute-sallamra-te-paketuar-51' },
  { id: 'snacks-embelsira-56', name: 'Snacks & Ëmbëlsira', url: '/items/snacks-embelsira-56' },
  { id: 'pije-69', name: 'Pije', url: '/items/pije-69' },
  { id: 'uje-74', name: 'Ujë', url: '/items/uje-74' },
  { id: 'kafe-caj-78', name: 'Kafe & Caj', url: '/items/kafe-caj-78' },
  // { id: 'alkool-84', name: 'Alkool', url: '/items/alkool-84' },
  { id: 'te-ngrira-92', name: 'Te ngrira', url: '/items/te-ngrira-92' },
  { id: 'femijet-99', name: 'Fëmijët', url: '/items/femijet-99' },
  { id: 'pastrues-detergjente-103', name: 'Pastrues & Detergjentë', url: '/items/pastrues-detergjente-103' },
  { id: 'kujdesi-per-shtepine-kuzhina-107', name: 'Kujdesi për shtëpinë & Kuzhina', url: '/items/kujdesi-per-shtepine-kuzhina-107' },
  { id: 'kujdes-personal-115', name: 'Kujdes Personal', url: '/items/kujdes-personal-115' },
  { id: 'kafshe-shtepiake-124', name: 'Kafshë Shtëpiake', url: '/items/kafshe-shtepiake-124' },
];

export const woltEcoMarketKikaConfig: Partial<ScraperConfig> = {
  name: 'Wolt Eco Market Kika',
  baseUrl: 'https://wolt.com/en/alb/tirana/venue/eco-market-kika',
  categories: woltEcoMarketKikaCategories,
  selectors: {
    productCard: 'li[role="listitem"]',
    productName: 'h3',
    productPrice: '[data-test-id="product-price"]',
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
  ],
};

export class WoltEcoMarketKikaScraper extends WoltVenueScraper {
  protected readonly venueSlug = 'eco-market-kika';

  constructor(config: ScraperConfig) {
    super(config);
  }
}
