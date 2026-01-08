# Implementation Plan: WhereIsLifeCheaper - Grocery Price Comparison System

## Project Overview

Build a web scraping system to compare grocery basket prices across **Turkey, Montenegro, Spain, and Uzbekistan** by automatically scraping supermarket websites daily and storing price data in a PostgreSQL database with a simple dashboard for visualization.

### Tech Stack
- **Backend**: Node.js + TypeScript + Express.js
- **Scraping**: Playwright for browser automation
- **Database**: PostgreSQL 15+
- **Scheduling**: node-cron for daily automation
- **Frontend**: React + Vite for simple dashboard
- **Logging**: Winston

## Architecture Summary

### Core Components
1. **Scraper Service**: Modular scrapers for each supermarket using Playwright
2. **Database Layer**: PostgreSQL with comprehensive schema for products, prices, countries, supermarkets
3. **API Service**: Express REST API for frontend data access
4. **Scheduler**: Daily cronjob to trigger scrapers for all supermarkets
5. **Frontend Dashboard**: Simple React app for price comparisons

### Key Design Decisions
- **Modular Scraper Architecture**: Abstract `BaseScraper` class extended by country-specific scrapers
- **Product Matching**: Use normalized names, brands, units, and barcodes to match products across countries
- **Price History**: Store all price points with timestamps for trend analysis
- **Error Resilience**: Retry logic, comprehensive logging, scrape status tracking

## Project Structure

```
whereislifecheaper/
├── src/
│   ├── scrapers/
│   │   ├── base/
│   │   │   ├── BaseScraper.ts          # Abstract scraper class
│   │   │   └── ScraperFactory.ts       # Factory pattern
│   │   ├── turkey/                     # Migros, A101, BIM, ŞOK, CarrefourSA
│   │   ├── montenegro/                 # Voli, Idea, HDL
│   │   ├── spain/                      # Mercadona, Carrefour, Alcampo, Dia
│   │   └── uzbekistan/                 # Korzinka, Makro, Havas
│   ├── database/
│   │   ├── migrations/                 # SQL migration files
│   │   └── models/                     # Database models
│   ├── services/
│   │   ├── scraper.service.ts          # Orchestrates scraping
│   │   ├── product.service.ts          # Product matching
│   │   └── price.service.ts            # Price management
│   ├── api/
│   │   ├── routes/                     # Express routes
│   │   └── controllers/                # Request handlers
│   ├── scheduler/
│   │   ├── cron.ts                     # Cron job setup
│   │   └── jobs/dailyScrape.job.ts     # Daily scraping job
│   ├── utils/
│   │   ├── logger.ts                   # Winston logger
│   │   ├── normalizer.ts               # Product name normalization
│   │   └── retry.ts                    # Retry logic
│   └── config/
│       ├── database.ts                 # DB connection
│       └── scrapers.ts                 # Scraper configs
├── frontend/
│   └── src/
│       ├── components/                 # React components
│       └── services/api.service.ts     # API client
├── scripts/
│   ├── migrate.ts                      # Run migrations
│   └── seed.ts                         # Seed initial data
└── logs/                               # Application logs
```

## Database Schema

### Core Tables

**countries**
- Stores Turkey, Montenegro, Spain, Uzbekistan with currency codes

**supermarkets**
- Links to country, stores website URL, scraper class name, config

**categories**
- Product categories (Fruits & Vegetables, Dairy, Meat, etc.)

**products**
- Product name, normalized_name (for matching), brand, unit, unit_quantity, barcode
- product_group_id for cross-country matching

**product_mappings**
- Links products to supermarkets with external_id and URL
- Tracks last_scraped_at and availability

**prices**
- Historical price data with timestamps
- Links to product_mapping, stores price, currency, is_on_sale, price_per_unit

**scrape_logs**
- Tracks each scraping run with status, duration, products_scraped, errors

### Key Indexes
- `products.normalized_name` - Fast product matching
- `prices.product_mapping_id + scraped_at` - Efficient price history queries
- `product_mappings.supermarket_id` - Quick supermarket product lookups

## Target Supermarkets

### Turkey
- **Migros** (migros.com.tr) - START HERE
- A101, BIM, ŞOK, CarrefourSA

### Montenegro
- **Voli** (voli.me)
- Idea, HDL Market

### Spain
- **Mercadona** (mercadona.es)
- Carrefour, Alcampo, Dia

### Uzbekistan
- **Korzinka** (korzinka.uz)
- Makro, Havas

## Implementation Steps

### Phase 1: Foundation ✅ COMPLETED
1. **Project Setup** ✅
   - ✅ Initialize package.json with TypeScript, Express, Playwright, pg, node-cron, winston
   - ✅ Create directory structure
   - ✅ Setup tsconfig.json
   - ✅ Create .env with database credentials
   - ✅ Create .gitignore and README.md

2. **Database Setup** ✅
   - ✅ Create docker-compose.yml for PostgreSQL
   - ✅ Write migration files for all tables (6 migrations)
   - ✅ Create seed data for countries, initial supermarkets, common categories
   - ✅ Setup database connection module
   - ✅ Create migration and seed scripts

3. **Configuration** ✅
   - ✅ Create environment variable validation (config/env.ts)
   - ✅ Setup Winston logger with file and console transports
   - ✅ Create database connection pool with DATABASE_URL
   - ✅ Create type definitions (scraper.types.ts, product.types.ts, api.types.ts)
   - ✅ Create utility modules (normalizer.ts, retry.ts)

### Phase 2: Scraper Foundation ✅ COMPLETED
1. **Base Scraper Architecture** ✅
   - ✅ Implement `BaseScraper` abstract class with:
     - ✅ `initialize()` - Setup Playwright browser/page
     - ✅ `scrapeProductList()` - Get all products from category pages
     - ✅ `scrapeProductDetails(url)` - Get detailed product info
     - ✅ `cleanup()` - Close browser
     - ✅ Common retry logic, anti-bot handling, screenshot on error
     - ✅ Helper methods for element extraction, navigation, waiting

2. **Scraper Factory** ✅
   - ✅ Create factory pattern to instantiate correct scraper based on supermarket
   - ✅ Support for database-driven configuration

3. **First Scraper: Migros Turkey** ✅
   - ✅ Create `MigrosScraper` extending `BaseScraper`
   - ✅ Implement selectors configuration for Migros
   - ✅ Implement product list scraping with pagination
   - ✅ Implement product card extraction
   - ✅ Integrate data normalization utilities
   - ✅ Create test script for manual scraper testing

### Phase 3: Data Services ✅ COMPLETED
1. **Product Normalization** ✅
   - ✅ Create `normalizeProductName()` to standardize product names
   - ✅ Create `extractQuantity()` to parse "1.5L", "500g", etc.
   - ✅ Implement brand extraction logic

2. **Product Matching Service** ✅
   - ✅ Implement matching algorithm:
     1. Match by barcode (if available)
     2. Match by brand + normalized_name + unit
     3. Fuzzy matching within category
   - ✅ Create product groups for equivalent products
   - ✅ ProductService with findOrCreateProduct, recordPrice methods

3. **Scraper Service** ✅
   - ✅ Orchestrate scraping: initialize scraper → scrape → save to DB → log results
   - ✅ Handle transactions for data consistency
   - ✅ Implement error handling and logging
   - ✅ Incremental saving after each page (onPageScraped callback)

### Phase 4: Scheduler ✅ COMPLETED
1. **Daily Scrape Job** ✅
   - ✅ Create `dailyScrape.job.ts`:
     - Get all active supermarkets
     - For each supermarket: create scraper, scrape, save prices, log status
     - Add delays between supermarkets to avoid rate limiting

2. **Cron Setup** ✅
   - ✅ Configure node-cron to run daily at 2 AM UTC
   - ✅ Create manual trigger endpoint for testing

3. **Testing** ✅
   - ✅ Test scraping job manually
   - ✅ Verify data saved correctly in database
   - ✅ Check logging output

### Phase 5: API Development ✅ COMPLETED
1. **Express Server Setup** ✅
   - ✅ Initialize Express with middleware: CORS, helmet, body-parser, error handler
   - ✅ Setup route structure

2. **Core Endpoints** ✅
   ```
   GET /api/countries                     # List countries ✅
   GET /api/supermarkets                  # List supermarkets ✅
   GET /api/products?category=...         # List products with filters ✅
   GET /api/products/:id                  # Product details ✅
   GET /api/prices/latest?product_ids=... # Latest prices ✅
   GET /api/prices/history/:productId     # Price history ✅
   GET /api/canonical                     # Canonical products for matching ✅
   GET /api/canonical/comparison          # Cross-country price comparison ✅
   GET /api/canonical/products-by-country # Products by country ✅
   PUT /api/canonical/link                # Link product to canonical ✅
   ```

3. **Controllers & Services** ✅
   - ✅ Implement controllers for each route
   - ✅ Create services for data access (ProductService, PriceService)

### Phase 6: Frontend Dashboard ✅ COMPLETED
1. **Simple HTML Dashboard** ✅ (Using vanilla JS instead of React for simplicity)
   - ✅ public/index.html - Main dashboard with scraper stats
   - ✅ public/mapping.html - Product mapping UI for canonical products
   - ✅ Product images display (50x50)
   - ✅ Search and filter functionality

2. **Core Features** ✅
   - ✅ Country selector
   - ✅ Product list with search
   - ✅ Product-to-canonical mapping interface
   - ✅ Scraper status dashboard

### Phase 7: Additional Scrapers ✅ PARTIALLY COMPLETED
1. **Turkey - Migros** ✅
   - ✅ MigrosScraper using REST API (faster than HTML scraping)
   - ✅ Cloudflare bypass using Playwright browser context
   - ✅ All food categories configured

2. **Montenegro - Voli** ✅
   - ✅ VoliScraper implemented
   - ✅ 150+ leaf categories collected (excluding alcohol and pork)
   - ✅ Full category hierarchy: drinks, dairy, fruits, vegetables, meat, fish, snacks, etc.

3. **Spain - Mercadona** 🔄 TODO
   - Config placeholder exists
   - Scraper not yet implemented

4. **Uzbekistan - Korzinka** 🔄 TODO
   - Config placeholder exists
   - Scraper not yet implemented

5. **Product Matching Across Countries** 🔄 IN PROGRESS
   - ✅ Canonical products table for manual matching
   - ✅ UI for linking products to canonical products
   - 🔄 Need more products linked to enable cross-country comparison

### Phase 8: Testing & Refinement 🔄 IN PROGRESS
1. **Testing** 🔄
   - 🔄 Unit tests for scrapers (test parsing logic)
   - 🔄 Integration tests for API endpoints
   - ✅ Test cronjob execution
   - ✅ End-to-end test: scrape → store → display in dashboard

2. **Optimization** ✅
   - ✅ Add database indexes for slow queries
   - ✅ Implement connection pooling
   - 🔄 Add basic caching for frequently accessed data

3. **Monitoring** 🔄
   - ✅ Create health check endpoint
   - 🔄 Setup email alerts for scraper failures
   - ✅ Create admin dashboard to view scrape logs

### Recent Bug Fixes & Improvements
- ✅ Fixed ProductService to use scraper's externalId instead of extracting from URL
- ✅ Fixed extractExternalId regex to handle hex IDs (e.g., `-p-f4725a`)
- ✅ Added product images to mapping page (50x50 with lazy loading)
- ✅ MigrosScraper rewritten to use REST API for efficiency
- ✅ Removed 5-page limit from Migros scraper
- ✅ Added incremental product saving after each page
- ✅ Category filtering for scrapers

## Critical Files to Create (in order)

### 1. Database Schema
`src/database/migrations/001_create_countries.sql` through `006_create_scrape_logs.sql`
- Foundation for all data storage

### 2. Base Scraper
`src/scrapers/base/BaseScraper.ts`
- Abstract class defining scraper interface and common functionality

### 3. Scraper Configuration
`src/config/scrapers.ts`
- Configuration structure for each supermarket's selectors and settings

### 4. First Scraper
`src/scrapers/turkey/MigrosScraper.ts`
- Concrete implementation for Migros Turkey

### 5. Scraper Service
`src/services/scraper.service.ts`
- Orchestrates scraping: scraper → data extraction → database storage → logging

### 6. Daily Scrape Job
`src/scheduler/jobs/dailyScrape.job.ts`
- Automation logic to run all scrapers daily

### 7. Product Service
`src/services/product.service.ts`
- Product matching and normalization logic

### 8. API Server
`src/api/server.ts`
- Express server with routes for frontend

## Key Implementation Details

### Product Normalization Strategy
```typescript
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // Remove special characters
    .replace(/\s+/g, ' ')          // Normalize whitespace
    .trim();
}

// "Coca-Cola® 1.5L PET" → "cocacola 15l pet"
```

### Product Matching Algorithm
1. **Exact barcode match** (highest confidence)
2. **Brand + normalized_name + unit match** (high confidence)
3. **Fuzzy match within same category** (medium confidence)
4. **Manual mapping table** for common products

### Scraper Configuration Example
```typescript
const migrosConfig = {
  supermarketId: 1,
  name: 'Migros',
  baseUrl: 'https://www.migros.com.tr',
  categoryUrls: ['/meyve-sebze-c-2', '/sut-kahvaltilik-c-4'],
  selectors: {
    productCard: '.product-card',
    productName: '.product-name',
    productPrice: '.product-price',
    productImage: '.product-image img',
    productUrl: '.product-card a'
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 2000,
    betweenRequests: 1000
  }
};
```

### Daily Scrape Job Flow
```typescript
async function runDailyScrape() {
  const supermarkets = await getActiveSupermarkets();

  for (const supermarket of supermarkets) {
    const logId = await createScrapeLog(supermarket.id);

    try {
      const scraper = ScraperFactory.create(supermarket);
      await scraper.initialize();

      const products = await scraper.scrapeProductList();
      await saveProducts(products, supermarket.id);

      await updateScrapeLog(logId, { status: 'success', count: products.length });
    } catch (error) {
      await updateScrapeLog(logId, { status: 'failed', error: error.message });
      await sendAlert(supermarket.id, error);
    } finally {
      await scraper.cleanup();
    }

    await sleep(60000); // 1 minute delay between supermarkets
  }
}
```

### Error Handling Strategy
- **Network errors**: Retry 3 times with exponential backoff
- **Selector not found**: Log error with screenshot, skip product, continue
- **Anti-bot detection**: Rotate user agents, add random delays
- **Database errors**: Rollback transaction, retry once
- **Critical failures**: Send email alert, log to error log file

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/whereislifecheaper

# API
API_PORT=3000
NODE_ENV=development

# Scraper
PLAYWRIGHT_HEADLESS=true
SCRAPER_MAX_RETRIES=3
SCRAPER_TIMEOUT=30000

# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# Frontend
VITE_API_URL=http://localhost:3000/api
```

## Dependencies

### Backend (package.json)
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "playwright": "^1.40.0",
    "pg": "^8.11.3",
    "node-cron": "^3.0.3",
    "winston": "^3.11.0",
    "dotenv": "^16.3.1",
    "joi": "^17.11.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.5",
    "@types/express": "^4.17.21",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2"
  }
}
```

### Frontend (frontend/package.json)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "recharts": "^2.10.3",
    "axios": "^1.6.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.8",
    "typescript": "^5.3.3"
  }
}
```

## Success Criteria

- ✅ Scrapers successfully collect prices from at least 1 supermarket per country
- ✅ Daily cronjob runs automatically and logs results
- ✅ Database stores products, prices, and scrape history
- ✅ API provides endpoints for products, prices, and comparisons
- ✅ Dashboard displays price comparisons across countries
- ✅ Product matching works for common grocery items
- ✅ Error handling prevents crashes and logs failures
- ✅ System can be extended to add more supermarkets easily

## Future Enhancements (Post-MVP)

1. Add more supermarkets (2-3 per country)
2. Implement currency conversion for direct price comparison
3. Add user accounts and custom shopping lists
4. Price alert notifications
5. Mobile app with barcode scanner
6. Machine learning for better product matching
7. Price prediction and trend analysis
