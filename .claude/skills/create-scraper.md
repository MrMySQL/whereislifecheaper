# Create Scraper Skill

This skill guides you through creating a new supermarket scraper for the WhereIsLifeCheaper price comparison system.

## When to Use

Use this skill when the user wants to:
- Add a new supermarket scraper
- Create a scraper for a new country
- Implement a new price scraping source

## Required Information

Before creating a scraper, gather from the user:

1. **Country**: Which country is this supermarket in? (TR, ME, ES, UZ, UA, or new country code)
2. **Supermarket name**: e.g., "Auchan", "Lidl", "Tesco"
3. **Website URL**: The main website URL for the supermarket

## Website Exploration with Playwright MCP

**IMPORTANT**: Before implementing the scraper, use Playwright MCP tools to explore the website structure. This is the required approach for analyzing supermarket websites.

### Step 1: Navigate to the Website

Use `mcp__playwright__browser_navigate` to open the website:
```
url: "https://example-supermarket.com"
```

### Step 2: Explore the Page Structure

Use `mcp__playwright__browser_snapshot` to get a structured view of the page elements including:
- Navigation menus and category links
- Product cards and their structure
- Price elements and currency formatting
- Image URLs and product links

### Step 3: Identify Category URLs

Navigate to different category pages to understand:
- URL patterns for categories (e.g., `/category/123` or `/products?cat=food`)
- How products are listed (grid, list, infinite scroll)
- Pagination mechanism (pages, load more button, infinite scroll)

### Step 4: Analyze Product Data

Look for:
- **API endpoints**: Check Network tab patterns, often sites use REST/GraphQL APIs
- **Product selectors**: CSS selectors for product cards, names, prices, images
- **Price format**: Currency symbol position, decimal separator
- **Data attributes**: `data-product-id`, `data-price`, etc.

### Step 5: Check for Anti-bot Measures

Use `mcp__playwright__browser_evaluate` to test if the site has:
- Cloudflare protection
- Cookie consent dialogs that block content
- Login requirements
- Rate limiting

### Exploration Workflow Example

```
1. mcp__playwright__browser_navigate -> main page
2. mcp__playwright__browser_snapshot -> understand layout
3. mcp__playwright__browser_click -> navigate to a category
4. mcp__playwright__browser_snapshot -> see product listing structure
5. mcp__playwright__browser_evaluate -> extract sample product data
6. Document findings for scraper implementation
```

## Determining Scraping Approach

After exploration, decide:
- **API-based**: If you found XHR/fetch calls returning JSON product data
- **DOM-based**: If products are rendered in HTML without accessible API

## Files to Create/Modify

When creating a new scraper, you must:

### 1. Create the Scraper Class

Create a new file at `src/scrapers/{country}/{SupermarketName}Scraper.ts`

The scraper must extend `BaseScraper` and implement:
- `initialize()`: Setup browser, navigate to site, handle anti-bot
- `scrapeCategory(category: CategoryConfig)`: Scrape products from a single category
- `scrapeProductDetails(url: string)`: Extract details for a single product (can throw if not used)
- `cleanup()`: Close browser and cleanup resources

Template structure:
```typescript
import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';

export class {SupermarketName}Scraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing {SupermarketName} scraper...`);
    this.startTime = Date.now();

    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to establish session/cookies
    await this.page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();
    await this.handleAntiBot();

    scraperLogger.info(`{SupermarketName} scraper initialized`);
  }

  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    // Implement category scraping logic
    const products: ProductData[] = [];
    // ... scraping logic
    return products;
  }

  async scrapeProductDetails(url: string): Promise<ProductData> {
    throw new Error(`scrapeProductDetails not implemented. URL: ${url}`);
  }

  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up {SupermarketName} scraper...`);
    await this.closeBrowser();
    const stats = this.getStats();
    scraperLogger.info('{SupermarketName} scraping completed:', stats);
  }
}
```

### 2. Add Configuration in Scraper File

Add categories and config at the top of the scraper file (before the class):

```typescript
import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';

/**
 * {SupermarketName} categories configuration
 */
export const {supermarketName}Categories: CategoryConfig[] = [
  { id: 'category-id', name: 'Category Name', url: '/category-url' },
  // ... more categories
];

/**
 * {SupermarketName} scraper configuration
 */
export const {supermarketName}Config: Partial<ScraperConfig> = {
  name: '{SupermarketName}',
  baseUrl: 'https://...',
  categories: {supermarketName}Categories,
  selectors: {
    productCard: '...',
    productName: '...',
    productPrice: '...',
    productImage: '...',
    productUrl: '...',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 3000,
    betweenRequests: 1500,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...',
  ],
};

export class {SupermarketName}Scraper extends BaseScraper {
  // ... class implementation
}
```

### 3. Register the Scraper

Add to `src/scrapers/scraperRegistry.ts`:

1. Import the scraper class and config from the scraper file:
```typescript
import { {SupermarketName}Scraper, {supermarketName}Config, {supermarketName}Categories } from './{country}/{SupermarketName}Scraper';
```

2. Add to the SCRAPER_REGISTRY map:
```typescript
[
  '{SupermarketName}Scraper',
  {
    className: '{SupermarketName}Scraper',
    scraperClass: {SupermarketName}Scraper,
    defaultConfig: {supermarketName}Config,
    categories: {supermarketName}Categories,
  },
],
```

### 4. Add Supermarket Seed Data

Add to `src/database/seeds/supermarkets.ts` in the `supermarketsData` array:

```typescript
{
  country_code: '{COUNTRY_CODE}',
  name: '{SupermarketName}',
  website_url: 'https://...',
  scraper_class: '{SupermarketName}Scraper',
  is_active: true,
},
```

## API-based vs DOM-based Scrapers

### API-based (Preferred)
If the supermarket has a public or hidden API:
- Use Playwright's `page.request` to make API calls with proper cookies/headers
- Parse JSON responses directly
- More reliable and faster
- Example: MigrosScraper, MercadonaScraper

### DOM-based
If no API is available:
- Use Playwright selectors to extract data from HTML
- Handle pagination with click or URL manipulation
- More fragile but works for any site
- Use `extractText()` and `extractAttribute()` helper methods from BaseScraper

## Product Data Structure

Each product must include:
```typescript
{
  name: string;           // Product name
  price: number;          // Current price
  currency: string;       // 'TRY', 'EUR', 'USD', 'UZS'
  originalPrice?: number; // If on sale
  isOnSale: boolean;
  imageUrl?: string;
  productUrl: string;     // Full URL to product page
  externalId?: string;    // SKU or product ID from the store
  brand?: string;
  unit?: string;          // 'kg', 'l', 'pieces', 'g', 'ml'
  unitQuantity?: number;  // e.g., 1.5 for 1.5kg
  isAvailable: boolean;
}
```

## Testing the Scraper

After creating the scraper:

1. Run the test script:
```bash
npm run scraper:test
```

2. Select the new scraper from the menu

3. Verify products are scraped correctly

## Important Considerations

1. **Rate Limiting**: Respect `waitTimes` configuration to avoid being blocked
2. **Error Handling**: Use `logError()` for failures, scraper should continue on individual product failures
3. **Pagination**: Handle properly using `onPageScraped` callback for incremental saving
4. **Currency**: Use correct ISO currency code for the country
5. **Unit Parsing**: Normalize units to standard format (kg, g, l, ml, pieces)
6. **Anti-bot**: Override `handleAntiBot()` if site has specific challenges

## Checklist

Before completing:
- [ ] Scraper class created and extends BaseScraper
- [ ] All abstract methods implemented
- [ ] Categories and config exported from scraper file
- [ ] Scraper registered in scraperRegistry.ts
- [ ] Seed data added to supermarkets.ts
- [ ] Test scraper runs successfully
- [ ] Products have correct currency and units
