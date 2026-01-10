import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';

/**
 * Mercadona categories configuration
 */
export const mercadonaCategories: CategoryConfig[] = [
  // Aceite, especias y salsas (Oil, spices and sauces)
  { id: '112', name: 'Aceite, vinagre y sal', url: '/categories/112/' },
  { id: '115', name: 'Especias', url: '/categories/115/' },
  { id: '116', name: 'Mayonesa, ketchup y mostaza', url: '/categories/116/' },
  { id: '117', name: 'Otras salsas', url: '/categories/117/' },
  // Agua y refrescos (Water and soft drinks)
  { id: '156', name: 'Agua', url: '/categories/156/' },
  { id: '163', name: 'Isotónico y energético', url: '/categories/163/' },
  { id: '158', name: 'Refresco de cola', url: '/categories/158/' },
  { id: '159', name: 'Refresco de naranja y de limón', url: '/categories/159/' },
  { id: '161', name: 'Tónica y bitter', url: '/categories/161/' },
  { id: '162', name: 'Refresco de té y sin gas', url: '/categories/162/' },
  // Aperitivos (Snacks)
  { id: '135', name: 'Aceitunas y encurtidos', url: '/categories/135/' },
  { id: '133', name: 'Frutos secos y fruta desecada', url: '/categories/133/' },
  { id: '132', name: 'Patatas fritas y snacks', url: '/categories/132/' },
  // Arroz, legumbres y pasta (Rice, legumes and pasta)
  { id: '118', name: 'Arroz', url: '/categories/118/' },
  { id: '121', name: 'Legumbres', url: '/categories/121/' },
  { id: '120', name: 'Pasta y fideos', url: '/categories/120/' },
  // Azúcar, caramelos y chocolate (Sugar, candy and chocolate)
  { id: '89', name: 'Azúcar y edulcorante', url: '/categories/89/' },
  { id: '95', name: 'Chicles y caramelos', url: '/categories/95/' },
  { id: '92', name: 'Chocolate', url: '/categories/92/' },
  { id: '97', name: 'Golosinas', url: '/categories/97/' },
  { id: '90', name: 'Mermelada y miel', url: '/categories/90/' },
  { id: '833', name: 'Turrones', url: '/categories/833/' },
  // Bebé (Baby)
  { id: '216', name: 'Alimentación infantil', url: '/categories/216/' },
  { id: '219', name: 'Biberón y chupete', url: '/categories/219/' },
  { id: '218', name: 'Higiene y cuidado', url: '/categories/218/' },
  { id: '217', name: 'Toallitas y pañales', url: '/categories/217/' },
  // Bodega (Wine cellar)
  { id: '164', name: 'Cerveza', url: '/categories/164/' },
  { id: '166', name: 'Cerveza sin alcohol', url: '/categories/166/' },
  { id: '181', name: 'Licores', url: '/categories/181/' },
  { id: '174', name: 'Sidra y cava', url: '/categories/174/' },
  { id: '168', name: 'Tinto de verano y sangría', url: '/categories/168/' },
  { id: '170', name: 'Vino blanco', url: '/categories/170/' },
  { id: '173', name: 'Vino lambrusco y espumoso', url: '/categories/173/' },
  { id: '171', name: 'Vino rosado', url: '/categories/171/' },
  { id: '169', name: 'Vino tinto', url: '/categories/169/' },
  // Cacao, café e infusiones (Coffee and tea)
  { id: '86', name: 'Cacao soluble y chocolate a la taza', url: '/categories/86/' },
  { id: '81', name: 'Café cápsula y monodosis', url: '/categories/81/' },
  { id: '83', name: 'Café molido y en grano', url: '/categories/83/' },
  { id: '84', name: 'Café soluble y otras bebidas', url: '/categories/84/' },
  { id: '88', name: 'Té e infusiones', url: '/categories/88/' },
  // Carne (Meat)
  { id: '46', name: 'Arreglos', url: '/categories/46/' },
  { id: '38', name: 'Aves y pollo', url: '/categories/38/' },
  { id: '47', name: 'Carne congelada', url: '/categories/47/' },
  { id: '37', name: 'Cerdo', url: '/categories/37/' },
  { id: '42', name: 'Conejo y cordero', url: '/categories/42/' },
  { id: '43', name: 'Embutido', url: '/categories/43/' },
  { id: '44', name: 'Hamburguesas y picadas', url: '/categories/44/' },
  { id: '40', name: 'Vacuno', url: '/categories/40/' },
  { id: '45', name: 'Empanados y elaborados', url: '/categories/45/' },
  // Cereales y galletas (Cereals and cookies)
  { id: '78', name: 'Cereales', url: '/categories/78/' },
  { id: '80', name: 'Galletas', url: '/categories/80/' },
  { id: '79', name: 'Tortitas', url: '/categories/79/' },
  // Charcutería y quesos (Deli and cheese)
  { id: '48', name: 'Aves y jamón cocido', url: '/categories/48/' },
  { id: '52', name: 'Bacón y salchichas', url: '/categories/52/' },
  { id: '49', name: 'Chopped y mortadela', url: '/categories/49/' },
  { id: '51', name: 'Embutido curado', url: '/categories/51/' },
  { id: '50', name: 'Jamón serrano', url: '/categories/50/' },
  { id: '58', name: 'Paté y sobrasada', url: '/categories/58/' },
  { id: '54', name: 'Queso curado, semicurado y tierno', url: '/categories/54/' },
  { id: '56', name: 'Queso lonchas, rallado y en porciones', url: '/categories/56/' },
  { id: '53', name: 'Queso untable, fresco y especialidades', url: '/categories/53/' },
  // Congelados (Frozen)
  { id: '147', name: 'Arroz y pasta', url: '/categories/147/' },
  { id: '148', name: 'Carne', url: '/categories/148/' },
  { id: '154', name: 'Helados', url: '/categories/154/' },
  { id: '155', name: 'Hielo', url: '/categories/155/' },
  { id: '150', name: 'Marisco', url: '/categories/150/' },
  { id: '149', name: 'Pescado', url: '/categories/149/' },
  { id: '151', name: 'Pizzas', url: '/categories/151/' },
  { id: '884', name: 'Rebozados', url: '/categories/884/' },
  { id: '152', name: 'Tartas y churros', url: '/categories/152/' },
  { id: '145', name: 'Verdura', url: '/categories/145/' },
  // Conservas, caldos y cremas (Canned goods, broths and soups)
  { id: '122', name: 'Atún y otras conservas de pescado', url: '/categories/122/' },
  { id: '123', name: 'Berberechos y mejillones', url: '/categories/123/' },
  { id: '127', name: 'Conservas de verdura y frutas', url: '/categories/127/' },
  { id: '130', name: 'Gazpacho y cremas', url: '/categories/130/' },
  { id: '129', name: 'Sopa y caldo', url: '/categories/129/' },
  { id: '126', name: 'Tomate', url: '/categories/126/' },
  // Cuidado del cabello (Hair care)
  { id: '201', name: 'Acondicionador y mascarilla', url: '/categories/201/' },
  { id: '199', name: 'Champú', url: '/categories/199/' },
  { id: '203', name: 'Coloración cabello', url: '/categories/203/' },
  { id: '202', name: 'Fijación cabello', url: '/categories/202/' },
  // Cuidado facial y corporal (Facial and body care)
  { id: '192', name: 'Afeitado y cuidado para hombre', url: '/categories/192/' },
  { id: '189', name: 'Cuidado corporal', url: '/categories/189/' },
  { id: '185', name: 'Cuidado e higiene facial', url: '/categories/185/' },
  { id: '191', name: 'Depilación', url: '/categories/191/' },
  { id: '188', name: 'Desodorante', url: '/categories/188/' },
  { id: '187', name: 'Gel y jabón de manos', url: '/categories/187/' },
  { id: '186', name: 'Higiene bucal', url: '/categories/186/' },
  { id: '190', name: 'Higiene íntima', url: '/categories/190/' },
  { id: '194', name: 'Manicura y pedicura', url: '/categories/194/' },
  { id: '196', name: 'Perfume y colonia', url: '/categories/196/' },
  { id: '198', name: 'Protector solar y aftersun', url: '/categories/198/' },
  // Fitoterapia y parafarmacia (Herbal and parapharmacy)
  { id: '213', name: 'Fitoterapia', url: '/categories/213/' },
  { id: '214', name: 'Parafarmacia', url: '/categories/214/' },
  // Fruta y verdura (Fruits and vegetables)
  { id: '27', name: 'Fruta', url: '/categories/27/' },
  { id: '28', name: 'Lechuga y ensalada preparada', url: '/categories/28/' },
  { id: '29', name: 'Verdura', url: '/categories/29/' },
  // Huevos, leche y mantequilla (Eggs, milk and butter)
  { id: '77', name: 'Huevos', url: '/categories/77/' },
  { id: '72', name: 'Leche y bebidas vegetales', url: '/categories/72/' },
  { id: '75', name: 'Mantequilla y margarina', url: '/categories/75/' },
  // Limpieza y hogar (Cleaning and home)
  { id: '226', name: 'Detergente y suavizante ropa', url: '/categories/226/' },
  { id: '237', name: 'Estropajo, bayeta y guantes', url: '/categories/237/' },
  { id: '241', name: 'Insecticida y ambientador', url: '/categories/241/' },
  { id: '234', name: 'Lejía y líquidos fuertes', url: '/categories/234/' },
  { id: '235', name: 'Limpiacristales', url: '/categories/235/' },
  { id: '233', name: 'Limpiahogar y friegasuelos', url: '/categories/233/' },
  { id: '231', name: 'Limpieza baño y WC', url: '/categories/231/' },
  { id: '230', name: 'Limpieza cocina', url: '/categories/230/' },
  { id: '232', name: 'Limpieza muebles y multiusos', url: '/categories/232/' },
  { id: '229', name: 'Limpieza vajilla', url: '/categories/229/' },
  { id: '243', name: 'Menaje y conservación de alimentos', url: '/categories/243/' },
  { id: '238', name: 'Papel higiénico y celulosa', url: '/categories/238/' },
  { id: '239', name: 'Pilas y bolsas de basura', url: '/categories/239/' },
  { id: '244', name: 'Utensilios de limpieza y calzado', url: '/categories/244/' },
  // Maquillaje (Makeup)
  { id: '206', name: 'Bases de maquillaje y corrector', url: '/categories/206/' },
  { id: '207', name: 'Colorete y polvos', url: '/categories/207/' },
  { id: '208', name: 'Labios', url: '/categories/208/' },
  { id: '210', name: 'Ojos', url: '/categories/210/' },
  { id: '212', name: 'Pinceles y brochas', url: '/categories/212/' },
  // Marisco y pescado (Seafood and fish)
  { id: '32', name: 'Marisco', url: '/categories/32/' },
  { id: '34', name: 'Pescado congelado', url: '/categories/34/' },
  { id: '31', name: 'Pescado fresco', url: '/categories/31/' },
  { id: '36', name: 'Salazones y ahumados', url: '/categories/36/' },
  // Mascotas (Pets)
  { id: '222', name: 'Gato', url: '/categories/222/' },
  { id: '221', name: 'Perro', url: '/categories/221/' },
  { id: '225', name: 'Otros', url: '/categories/225/' },
  // Panadería y pastelería (Bakery and pastry)
  { id: '65', name: 'Bollería de horno', url: '/categories/65/' },
  { id: '66', name: 'Bollería envasada', url: '/categories/66/' },
  { id: '69', name: 'Harina y preparado repostería', url: '/categories/69/' },
  { id: '59', name: 'Pan de horno', url: '/categories/59/' },
  { id: '60', name: 'Pan de molde y otras especialidades', url: '/categories/60/' },
  { id: '62', name: 'Pan tostado y rallado', url: '/categories/62/' },
  { id: '64', name: 'Picos, rosquilletas y picatostes', url: '/categories/64/' },
  { id: '68', name: 'Tartas y pasteles', url: '/categories/68/' },
  { id: '71', name: 'Velas y decoración', url: '/categories/71/' },
  // Pizzas y platos preparados (Pizzas and prepared dishes)
  { id: '897', name: 'Listo para Comer', url: '/categories/897/' },
  { id: '138', name: 'Pizzas', url: '/categories/138/' },
  { id: '140', name: 'Platos preparados calientes', url: '/categories/140/' },
  { id: '142', name: 'Platos preparados fríos', url: '/categories/142/' },
  // Postres y yogures (Desserts and yogurt)
  { id: '105', name: 'Bífidus', url: '/categories/105/' },
  { id: '110', name: 'Flan y natillas', url: '/categories/110/' },
  { id: '111', name: 'Gelatina y otros postres', url: '/categories/111/' },
  { id: '106', name: 'Postres de soja', url: '/categories/106/' },
  { id: '103', name: 'Yogures desnatados', url: '/categories/103/' },
  { id: '109', name: 'Yogures griegos', url: '/categories/109/' },
  { id: '108', name: 'Yogures líquidos', url: '/categories/108/' },
  { id: '104', name: 'Yogures naturales y sabores', url: '/categories/104/' },
  { id: '107', name: 'Yogures y postres infantiles', url: '/categories/107/' },
  // Zumos (Juices)
  { id: '99', name: 'Fruta variada', url: '/categories/99/' },
  { id: '100', name: 'Melocotón y piña', url: '/categories/100/' },
  { id: '143', name: 'Naranja', url: '/categories/143/' },
  { id: '98', name: 'Tomate y otros sabores', url: '/categories/98/' },
];

/**
 * Mercadona scraper configuration
 */
export const mercadonaConfig: Partial<ScraperConfig> = {
  name: 'Mercadona',
  baseUrl: 'https://tienda.mercadona.es',
  categories: mercadonaCategories,
  selectors: {
    // Not used for API-based scraping, kept for compatibility
    productCard: '.product-cell',
    productName: '.product-title',
    productPrice: '.product-price',
    productImage: '.product-image img',
    productUrl: 'a',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 3000,
    betweenRequests: 1500,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/**
 * Mercadona API response types
 */
interface MercadonaCategoryResponse {
  id: number;
  name: string;
  order: number;
  categories?: MercadonaCategoryResponse[];
  products?: MercadonaProduct[];
}

interface MercadonaProduct {
  id: string;
  slug: string;
  display_name: string;
  packaging?: string;
  thumbnail: string;
  share_url: string;
  price_instructions: {
    unit_price: string;
    bulk_price?: string;
    unit_size?: number;
    size_format?: string;
    reference_price?: string;
    reference_format?: string;
    previous_unit_price?: string | null;
    price_decreased?: boolean;
    is_pack?: boolean;
    is_new?: boolean;
  };
  badges?: {
    is_water?: boolean;
    requires_age_check?: boolean;
  };
}

/**
 * Scraper for Mercadona Spain (tienda.mercadona.es)
 * Uses the REST API for efficient data extraction
 * Requires browser context to establish session with postal code
 */
export class MercadonaScraper extends BaseScraper {
  private readonly API_BASE = 'https://tienda.mercadona.es/api';
  private readonly POSTAL_CODE = '28001'; // Madrid postal code

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with browser (needed to set postal code)
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Mercadona API scraper...`);
    this.startTime = Date.now();

    // Launch browser to handle postal code entry
    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to main page to trigger postal code dialog
    scraperLogger.info('Navigating to Mercadona to establish session...');
    await this.page.goto('https://tienda.mercadona.es', { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();

    // Enter postal code to unlock the site
    await this.enterPostalCode();

    scraperLogger.info(`Mercadona API scraper initialized`);
  }

  /**
   * Enter postal code to establish delivery zone
   */
  private async enterPostalCode(): Promise<void> {
    if (!this.page) return;

    try {
      // Wait for postal code input field
      const postalInput = await this.page.waitForSelector('input[name="postalCode"]', {
        timeout: 10000,
      }).catch(() => null);

      if (postalInput) {
        scraperLogger.info(`Entering postal code: ${this.POSTAL_CODE}`);
        await postalInput.fill(this.POSTAL_CODE);

        // Click the submit button
        const submitButton = await this.page.$('button[type="submit"]');
        if (submitButton) {
          await submitButton.click();
          await this.waitForDynamicContent();
        }

        scraperLogger.info('Postal code entered successfully');
      } else {
        // Postal code may already be set from previous session
        scraperLogger.debug('Postal code input not found - session may already be established');
      }
    } catch (error) {
      scraperLogger.warn('Failed to enter postal code:', error);
    }
  }

  /**
   * Scrape a single category using REST API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    // Category URL format: the ID is in the URL (e.g., "112" from category config)
    const categoryId = category.id;
    return this.scrapeCategoryViaApi(categoryId, category.name);
  }

  /**
   * Scrape a single category using REST API
   * Handles nested categories recursively
   */
  private async scrapeCategoryViaApi(
    categoryId: string,
    categoryName: string
  ): Promise<ProductData[]> {
    const products: ProductData[] = [];

    try {
      const categoryData = await this.fetchCategory(categoryId);

      if (!categoryData) {
        scraperLogger.warn(`Failed to fetch category ${categoryName}`);
        return products;
      }

      // Recursively collect products from nested categories
      const allProducts = this.collectProductsRecursively(categoryData);

      scraperLogger.info(`Category ${categoryName}: Found ${allProducts.length} products`);

      // Parse and save products
      const parsedProducts = this.parseProducts(allProducts);

      // Save products via callback
      if (this.onPageScraped && parsedProducts.length > 0) {
        const savedCount = await this.onPageScraped(parsedProducts, {
          categoryId,
          categoryName,
          pageNumber: 1,
          totalProductsOnPage: parsedProducts.length,
        });
        scraperLogger.info(
          `${categoryName}: Saved ${savedCount}/${parsedProducts.length} products`
        );
      }

      products.push(...parsedProducts);
    } catch (error) {
      this.logError(
        `Failed to scrape category ${categoryName}`,
        `${this.API_BASE}/categories/${categoryId}/`,
        error as Error
      );
    }

    return products;
  }

  /**
   * Fetch a category from the API using browser context
   */
  private async fetchCategory(categoryId: string): Promise<MercadonaCategoryResponse | null> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = `${this.API_BASE}/categories/${categoryId}/`;

    try {
      // Use Playwright's request context (includes cookies from browser)
      const response = await this.page.request.get(url, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok()) {
        scraperLogger.warn(`API request failed: ${response.status()} ${response.statusText()}`);
        return null;
      }

      const data: MercadonaCategoryResponse = await response.json();
      return data;
    } catch (error) {
      scraperLogger.error(`Failed to fetch ${url}:`, error);
      return null;
    }
  }

  /**
   * Recursively collect products from nested category structure
   */
  private collectProductsRecursively(category: MercadonaCategoryResponse): MercadonaProduct[] {
    const products: MercadonaProduct[] = [];

    // If this category has products, add them
    if (category.products && category.products.length > 0) {
      products.push(...category.products);
    }

    // If this category has subcategories, recurse into them
    if (category.categories && category.categories.length > 0) {
      for (const subCategory of category.categories) {
        products.push(...this.collectProductsRecursively(subCategory));
      }
    }

    return products;
  }

  /**
   * Parse API product data into ProductData format
   */
  private parseProducts(apiProducts: MercadonaProduct[]): ProductData[] {
    const products: ProductData[] = [];

    if (!apiProducts || !Array.isArray(apiProducts)) {
      scraperLogger.warn(`No products array in API response`);
      return products;
    }

    for (const item of apiProducts) {
      try {
        const priceInfo = item.price_instructions;

        // Parse unit price (string to number)
        const price = parseFloat(priceInfo.unit_price);
        if (isNaN(price)) {
          scraperLogger.debug(`Could not parse price for product: ${item.display_name}`);
          continue;
        }

        // Check for sale/discount
        const previousPrice = priceInfo.previous_unit_price
          ? parseFloat(priceInfo.previous_unit_price)
          : undefined;
        const isOnSale = priceInfo.price_decreased || (previousPrice && previousPrice > price);

        // Parse unit information
        const { unit, unitQuantity } = this.parseUnit(priceInfo.size_format, priceInfo.unit_size);

        // Extract brand from display name (Hacendado, Mercadona, etc.)
        const brand = this.extractBrand(item.display_name);

        // Include packaging AND unit info in name to distinguish variants
        // e.g., "Huevos grandes L Paquete 12 ud." vs "Huevos grandes L Paquete 6 ud."
        const productName = this.buildProductName(
          item.display_name,
          item.packaging,
          priceInfo.unit_size,
          priceInfo.size_format
        );

        const product: ProductData = {
          name: productName,
          price,
          currency: 'EUR',
          originalPrice: isOnSale ? previousPrice : undefined,
          isOnSale: !!isOnSale,
          imageUrl: item.thumbnail,
          productUrl: item.share_url,
          brand,
          unit,
          unitQuantity,
          isAvailable: true,
          externalId: item.id,
        };

        products.push(product);
        this.productsScraped++;
      } catch (error) {
        this.productsFailed++;
        scraperLogger.debug(`Failed to parse product: ${item.display_name}`, error);
      }
    }

    return products;
  }

  /**
   * Parse Mercadona unit format to standard format
   */
  private parseUnit(sizeFormat?: string, unitSize?: number): { unit?: string; unitQuantity?: number } {
    if (!sizeFormat || !unitSize) {
      return { unit: undefined, unitQuantity: undefined };
    }

    // Normalize the format string
    const format = sizeFormat.toLowerCase();

    switch (format) {
      case 'kg':
        return { unit: 'kg', unitQuantity: unitSize };
      case 'g':
        if (unitSize >= 1000) {
          return { unit: 'kg', unitQuantity: unitSize / 1000 };
        }
        return { unit: 'g', unitQuantity: unitSize };
      case 'l':
        return { unit: 'l', unitQuantity: unitSize };
      case 'ml':
        if (unitSize >= 1000) {
          return { unit: 'l', unitQuantity: unitSize / 1000 };
        }
        return { unit: 'ml', unitQuantity: unitSize };
      case 'cl':
        // Convert centiliters to liters
        return { unit: 'l', unitQuantity: unitSize / 100 };
      case 'ud':
      case 'uds':
      case 'unidad':
      case 'unidades':
        return { unit: 'pieces', unitQuantity: unitSize };
      default:
        return { unit: format, unitQuantity: unitSize };
    }
  }

  /**
   * Build full product name including packaging and unit info
   * This ensures variants are distinguished, e.g.:
   * - "Huevos grandes L Paquete 12 ud." vs "Huevos grandes L Paquete 6 ud."
   * - "Leche entera Hacendado Brick 1 l" vs "Leche entera Hacendado 6 bricks x 1 l"
   */
  private buildProductName(
    displayName: string,
    packaging?: string,
    unitSize?: number,
    sizeFormat?: string
  ): string {
    let name = displayName;

    // Add packaging if present
    if (packaging) {
      name = `${name} ${packaging}`;
    }

    // Add unit size and format if present and not already included in packaging
    // Check if the packaging already contains the quantity info
    if (unitSize && sizeFormat) {
      const unitInfo = `${unitSize} ${sizeFormat}`;
      // Only add if not already present in the name or packaging
      if (!name.toLowerCase().includes(unitInfo.toLowerCase())) {
        name = `${name} ${unitInfo}`;
      }
    }

    return name;
  }

  /**
   * Extract brand from product display name
   * Mercadona's private labels: Hacendado, Bosque Verde, Deliplus, Compy
   */
  private extractBrand(displayName: string): string | undefined {
    const knownBrands = [
      'Hacendado',
      'Bosque Verde',
      'Deliplus',
      'Compy',
      'Hacendado Artesano',
    ];

    for (const brand of knownBrands) {
      if (displayName.includes(brand)) {
        return brand;
      }
    }

    // Try to extract brand from end of name (common pattern: "Product Name BrandName")
    // This is a simplified approach - not all products have brand in name
    return undefined;
  }

  /**
   * Scrape detailed product information (not needed for API-based scraping)
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    // For API-based scraping, we get all details from the category endpoint
    // This method is kept for interface compatibility
    throw new Error(`scrapeProductDetails not implemented for API-based scraper. URL: ${url}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up Mercadona API scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Mercadona scraping completed:', stats);
  }
}
