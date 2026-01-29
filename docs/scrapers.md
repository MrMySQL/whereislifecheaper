# Scraper Architecture

This document describes the web scraping system used to collect grocery prices from supermarket websites.

## Overview

The scraping system uses Playwright for browser automation to handle JavaScript-heavy websites, anti-bot measures, and dynamic content loading. All scrapers extend a common base class that provides:

- Browser lifecycle management
- Retry logic with exponential backoff
- Rate limiting and anti-detection
- Error handling and logging
- Statistics tracking

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ScraperService                               │
│  - Orchestrates scraper execution                               │
│  - Manages database operations                                   │
│  - Handles incremental product saving                           │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ScraperFactory                                │
│  - Creates scraper instances from database config               │
│  - Merges runtime options with defaults                         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ScraperRegistry                                │
│  - Maps scraper class names to implementations                  │
│  - Stores default configurations per scraper                    │
│  - Provides available categories                                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BaseScraper                                  │
│  - Abstract class with common functionality                     │
│  - Browser management, retries, logging                         │
└─────────────────────────────────────────────────────────────────┘
         │           │           │           │           │
         ▼           ▼           ▼           ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │ Migros  │ │  Voli   │ │Mercadona│ │ Auchan  │ │  Arbuz  │
    │(Turkey) │ │ (ME)    │ │ (Spain) │ │(Ukraine)│ │  (KZ)   │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

## BaseScraper

Located at: `src/scrapers/base/BaseScraper.ts`

### Abstract Methods

Every scraper must implement these methods:

```typescript
abstract initialize(): Promise<void>;
// Setup browser, navigate to site, handle initial popups

abstract scrapeCategory(category: CategoryConfig): Promise<ProductData[]>;
// Scrape all products from a single category

abstract scrapeProductDetails(url: string): Promise<ProductData | null>;
// Extract detailed information from a product page (optional)

abstract cleanup(): Promise<void>;
// Close browser and release resources
```

### Browser Management

```typescript
// Launch browser with anti-detection settings
await this.launchBrowser();

// Create page with custom user agent and headers
const page = await this.createPage();

// Navigate with retry logic
await this.navigateToUrl(page, url);

// Wait for dynamic content
await this.waitForDynamicContent(page, selector);
```

### Anti-Bot Measures

BaseScraper includes several techniques to avoid detection:

1. **Random User Agents**: Rotates between common browser user agents
2. **Human-like Delays**: Random wait times between requests
3. **Mouse Movements**: Simulated mouse activity
4. **Scroll Behavior**: Natural scrolling patterns
5. **Request Headers**: Realistic browser headers

```typescript
// Configure anti-bot settings in scraper config
const config: ScraperConfig = {
  waitTimes: {
    pageLoad: 3000,      // Wait after page load
    dynamicContent: 2000, // Wait for JS rendering
    betweenRequests: 1500 // Delay between requests
  },
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...'
  ]
};
```

### Retry Logic

Automatic retry with exponential backoff:

```typescript
// Retry configuration
const result = await this.retryOnFailure(
  async () => await this.scrapeProductPage(url),
  {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    factor: 2
  }
);
```

### Error Handling

```typescript
try {
  await this.scrapeCategory(category);
} catch (error) {
  // Capture screenshot for debugging
  await this.takeScreenshot(`error-${category.id}`);

  // Log error with context
  this.logError(error, { category: category.id, url: page.url() });

  // Track in statistics
  this.stats.errors.push({ category: category.id, error: error.message });
}
```

## ScraperFactory

Located at: `src/scrapers/base/ScraperFactory.ts`

Creates scraper instances from database configuration:

```typescript
// Create from supermarket database record
const scraper = await ScraperFactory.createFromSupermarket(supermarket, {
  categories: ['fruits', 'dairy'], // Optional category filter
  headless: true,
  maxRetries: 3
});

// Create directly from config
const scraper = ScraperFactory.create('MigrosScraper', config);
```

## ScraperRegistry

Located at: `src/scrapers/scraperRegistry.ts`

Central registry of all available scrapers:

```typescript
// Register a new scraper
scraperRegistry.set('MigrosScraper', {
  className: 'MigrosScraper',
  scraperClass: MigrosScraper,
  defaultConfig: {
    baseUrl: 'https://www.migros.com.tr',
    waitTimes: { ... }
  },
  categories: [
    { id: 'fruits', name: 'Fruits & Vegetables', url: '...' },
    { id: 'dairy', name: 'Dairy', url: '...' }
  ]
});

// Get scraper class
const ScraperClass = scraperRegistry.get('MigrosScraper').scraperClass;
```

## Country-Specific Scrapers

The system currently supports **14 scraper implementations** across **10 countries**.

### Turkey - MigrosScraper

**Location**: `src/scrapers/turkey/MigrosScraper.ts`

**Strategy**: Uses Migros REST API via browser context to bypass Cloudflare

**Categories**: fruits, meat, dairy, staples, beverages, snacks, frozen

```typescript
// API-based scraping
const apiUrl = `https://www.migros.com.tr/rest/products/search?category=${categoryId}`;
const response = await page.evaluate(async (url) => {
  const res = await fetch(url);
  return res.json();
}, apiUrl);
```

---

### Montenegro - VoliScraper

**Location**: `src/scrapers/montenegro/VoliScraper.ts`

**Strategy**: Traditional HTML scraping with CSS selectors

**Categories**: 50+ categories with local Serbian names

```typescript
// HTML-based scraping
const products = await page.$$eval('.product-card', (cards) => {
  return cards.map(card => ({
    name: card.querySelector('.product-title')?.textContent,
    price: card.querySelector('.product-price')?.textContent,
    image: card.querySelector('img')?.src
  }));
});
```

---

### Spain - MercadonaScraper

**Location**: `src/scrapers/spain/MercadonaScraper.ts`

**Strategy**: API-based scraping similar to Migros

---

### Uzbekistan - MakroScraper

**Location**: `src/scrapers/uzbekistan/MakroScraper.ts`

**Strategy**: HTML-based scraping

---

### Ukraine - AuchanUaScraper / AuchanUaGraphQLScraper

**Location**: `src/scrapers/ukraine/`

**Strategy**: Two implementations available:
- **AuchanUaScraper** - Traditional HTML/DOM scraping
- **AuchanUaGraphQLScraper** - GraphQL API approach (preferred)

```typescript
// GraphQL approach
const query = `
  query GetProducts($categoryId: ID!, $page: Int!) {
    products(categoryId: $categoryId, page: $page) {
      items { id name price imageUrl }
      hasMore
    }
  }
`;
```

---

### Kazakhstan - ArbuzScraper

**Location**: `src/scrapers/kazakhstan/ArbuzScraper.ts`

**Strategy**: API-based scraping

---

### Germany - ReweScraper / KnusprScraper

**Location**: `src/scrapers/germany/`

**Strategy**: Two supermarket implementations:
- **ReweScraper** - REWE supermarket chain (DOM-based)
- **KnusprScraper** - Knuspr online grocery (DOM-based)

---

### Malaysia - LotussScraper / LotussApiScraper

**Location**: `src/scrapers/malaysia/`

**Strategy**: Two implementations:
- **LotussScraper** - Traditional HTML/DOM scraping
- **LotussApiScraper** - API-based scraping (preferred)

---

### Albania - SparAlbaniaScraper

**Location**: `src/scrapers/albania/SparAlbaniaScraper.ts`

**Strategy**: DOM-based scraping of SPAR Albania website

**Categories**: fruits, meat, dairy, staples, beverages, snacks, frozen

---

### Austria - GurkeralScraper

**Location**: `src/scrapers/austria/GurkeralScraper.ts`

**Strategy**: DOM-based scraping of Gurkerl online grocery

**Categories**: fruits, meat, dairy, staples, beverages, snacks, frozen

---

## Scraper Summary Table

| Country | Supermarket | Class Name | Type | Status |
|---------|-------------|-----------|------|--------|
| Turkey | Migros | MigrosScraper | API | Active |
| Montenegro | Voli | VoliScraper | DOM | Active |
| Spain | Mercadona | MercadonaScraper | API | Active |
| Uzbekistan | Makro | MakroScraper | DOM | Active |
| Ukraine | Auchan | AuchanUaScraper | DOM | Active |
| Ukraine | Auchan | AuchanUaGraphQLScraper | GraphQL | Active |
| Kazakhstan | Arbuz | ArbuzScraper | API | Active |
| Germany | REWE | ReweScraper | DOM | Active |
| Germany | Knuspr | KnusprScraper | DOM | Active |
| Malaysia | Lotus's | LotussScraper | DOM | Active |
| Malaysia | Lotus's | LotussApiScraper | API | Active |
| Albania | SPAR | SparAlbaniaScraper | DOM | Active |
| Austria | Gurkerl | GurkeralScraper | DOM | Active |

## Product Data Structure

Scrapers return standardized `ProductData` objects:

```typescript
interface ProductData {
  externalId: string;        // Supermarket's product ID
  name: string;              // Product name
  brand?: string;            // Brand name
  price: number;             // Current price
  currency: string;          // Currency code
  originalPrice?: number;    // Price before discount
  isOnSale?: boolean;        // Sale flag
  unit?: string;             // Unit type (kg, L, piece)
  unitQuantity?: number;     // Quantity per unit
  pricePerUnit?: number;     // Calculated price/kg or price/L
  imageUrl?: string;         // Product image URL
  url?: string;              // Product page URL
  barcode?: string;          // EAN/UPC barcode
  categoryId?: string;       // Category identifier
  description?: string;      // Product description
}
```

## Running Scrapers

### CLI Scripts

```bash
# Run all active scrapers (3 parallel)
npm run scraper:run

# Run specific scraper by name
npm run scraper:run -- migros

# Run with category filter
npm run scraper:run -- migros --categories=fruits,dairy

# List available categories
npm run scraper:run -- migros -l

# Custom concurrency
npm run scraper:run -- --concurrency=5

# Test a scraper (limited products)
npm run scraper:test -- migros
```

### Programmatic Execution

```typescript
import { ScraperService } from './services/ScraperService';

const service = new ScraperService();

// Run single scraper
const result = await service.runScraper(supermarketId, {
  categories: ['fruits', 'dairy']
});

// Run all scrapers
const results = await service.runAllScrapers({ concurrency: 3 });
```

## Adding a New Scraper

### Step 1: Create Scraper Class

```typescript
// src/scrapers/newcountry/NewSupermarketScraper.ts

import { BaseScraper } from '../base/BaseScraper';
import { ProductData, CategoryConfig } from '../../types/scraper.types';

export class NewSupermarketScraper extends BaseScraper {
  async initialize(): Promise<void> {
    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to homepage
    await this.navigateToUrl(this.page, this.config.baseUrl);

    // Handle cookie consent, popups, etc.
    await this.handlePopups();
  }

  async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];

    await this.navigateToUrl(this.page, category.url);
    await this.waitForDynamicContent(this.page, '.product-list');

    // Extract products
    const items = await this.page.$$('.product-item');

    for (const item of items) {
      const product = await this.extractProduct(item);
      if (product) {
        products.push(product);
      }

      // Rate limiting
      await this.waitBetweenRequests();
    }

    return products;
  }

  async scrapeProductDetails(url: string): Promise<ProductData | null> {
    // Optional: detailed product page scraping
    return null;
  }

  async cleanup(): Promise<void> {
    await this.closeBrowser();
  }

  private async extractProduct(element: ElementHandle): Promise<ProductData | null> {
    try {
      const name = await this.extractText(element, '.product-name');
      const priceText = await this.extractText(element, '.product-price');
      const price = this.parsePrice(priceText);

      return {
        externalId: await this.extractAttribute(element, '[data-id]', 'data-id'),
        name,
        price,
        currency: 'USD',
        imageUrl: await this.extractAttribute(element, 'img', 'src')
      };
    } catch (error) {
      this.logError(error, { context: 'extractProduct' });
      return null;
    }
  }

  private parsePrice(text: string): number {
    // Remove currency symbols and parse
    return parseFloat(text.replace(/[^0-9.,]/g, '').replace(',', '.'));
  }
}
```

### Step 2: Register Scraper

```typescript
// src/scrapers/scraperRegistry.ts

import { NewSupermarketScraper } from './newcountry/NewSupermarketScraper';

scraperRegistry.set('NewSupermarketScraper', {
  className: 'NewSupermarketScraper',
  scraperClass: NewSupermarketScraper,
  defaultConfig: {
    baseUrl: 'https://www.newsupermarket.com',
    selectors: {
      productList: '.product-grid',
      productItem: '.product-card',
      productName: '.product-title',
      productPrice: '.price'
    },
    waitTimes: {
      pageLoad: 3000,
      dynamicContent: 2000,
      betweenRequests: 1500
    }
  },
  categories: [
    { id: 'fruits', name: 'Fruits & Vegetables', url: '/category/fruits' },
    { id: 'dairy', name: 'Dairy Products', url: '/category/dairy' }
  ]
});
```

### Step 3: Add Database Seed

```typescript
// src/database/seeds/supermarkets.ts

const supermarkets = [
  // ... existing supermarkets
  {
    country_code: 'XX',
    name: 'New Supermarket',
    base_url: 'https://www.newsupermarket.com',
    scraper_config: {
      scraperClass: 'NewSupermarketScraper',
      selectors: { ... },
      waitTimes: { ... }
    },
    is_active: true
  }
];
```

### Step 4: Test Scraper

```bash
# Run with limited output
npm run scraper:test -- newsupermarket

# Check logs
tail -f logs/combined.log
```

## Configuration

### Environment Variables

```bash
# Headless mode (default: true)
PLAYWRIGHT_HEADLESS=true

# Maximum retry attempts
SCRAPER_MAX_RETRIES=3

# Page load timeout (ms)
SCRAPER_TIMEOUT=30000

# Concurrent browser instances
SCRAPER_CONCURRENT_BROWSERS=3
```

### Scraper Config Schema

```typescript
interface ScraperConfig {
  baseUrl: string;

  selectors?: {
    productList?: string;
    productItem?: string;
    productName?: string;
    productPrice?: string;
    productImage?: string;
    pagination?: string;
  };

  waitTimes?: {
    pageLoad?: number;       // After navigation (default: 3000)
    dynamicContent?: number; // For JS rendering (default: 2000)
    betweenRequests?: number; // Rate limiting (default: 1500)
    betweenCategories?: number; // Between categories (default: 5000)
  };

  userAgents?: string[];

  headers?: Record<string, string>;

  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
  }>;

  maxRetries?: number;      // Default: 3
  timeout?: number;         // Default: 30000
  headless?: boolean;       // Default: true
}
```

## Monitoring

### Scrape Logs Table

Every scraper execution is logged:

```sql
SELECT
  s.name AS supermarket,
  sl.status,
  sl.products_scraped,
  sl.products_failed,
  sl.started_at,
  sl.completed_at,
  sl.error_message
FROM scrape_logs sl
JOIN supermarkets s ON sl.supermarket_id = s.id
ORDER BY sl.started_at DESC
LIMIT 10;
```

### Statistics

```typescript
// Get scraper stats after execution
const stats = scraper.getStats();
console.log({
  productsScraped: stats.productsScraped,
  productsFailed: stats.productsFailed,
  categoriesProcessed: stats.categoriesProcessed,
  duration: stats.duration,
  errors: stats.errors
});
```

### Debug Screenshots

On errors, screenshots are saved to `logs/screenshots/`:

```typescript
// Manual screenshot
await this.takeScreenshot('debug-category-page');
```

## Best Practices

1. **Rate Limiting**: Always respect website rate limits
2. **Error Handling**: Wrap all operations in try-catch
3. **Incremental Saving**: Use `onPageScraped` callback for large categories
4. **Screenshots**: Capture screenshots on failures for debugging
5. **User Agents**: Rotate user agents to avoid detection
6. **Selectors**: Use robust selectors that survive minor HTML changes
7. **Timeouts**: Set appropriate timeouts for slow pages
8. **Logging**: Log enough context for debugging
9. **Testing**: Test scrapers thoroughly before production
10. **Monitoring**: Check scrape_logs regularly for failures
