# WhereIsLifeCheaper - Claude Code Guide

## WHY: Project Purpose

This is a multi-country grocery price comparison system that scrapes supermarket websites daily to help users compare the cost of living across countries, started from Turkey, Montenegro, Spain, and Uzbekistan and more to come. The system tracks prices over time, matches products across countries, and provides a web API for price comparisons.

## WHAT: Architecture & Stack

### Technology Stack
- **Runtime**: Node.js 18+ with TypeScript
- **Web Framework**: Express.js for REST API
- **Scraping**: Playwright for browser automation (Chromium)
- **Database**: PostgreSQL 15+ (running in Docker)
- **Scheduling**: node-cron for daily automated scraping
- **Logging**: Winston with file-based logs in `logs/`

### Directory Structure

```
src/
├── scrapers/           # Scraper implementations per country (extend BaseScraper)
│   ├── base/          # BaseScraper abstract class & ScraperFactory
│   └── turkey/        # MigrosScraper (first implementation)
├── database/          # Database layer
│   ├── seeds/         # Initial data (countries, categories, supermarkets)
│   └── index.ts       # Connection pool & query interface
├── services/          # Business logic layer
├── api/               # Express REST API endpoints
├── scheduler/         # Cron job definitions
├── utils/             # Logger, retry logic, text normalizer
├── config/            # Environment config, scraper configs
└── types/             # TypeScript type definitions

scripts/               # Standalone scripts (migrate, seed, test-scraper)
tests/                # Unit and integration tests
```

### Database Schema Overview

Core tables: `countries` → `supermarkets` → `products` ↔ `product_mappings` ← `prices`

- **countries**: 4 countries (TR, ME, ES, UZ)
- **supermarkets**: Each has a scraper configuration (base_url, selectors)
- **products**: Master catalog with normalized names
- **product_mappings**: Links products to specific supermarkets
- **prices**: Time-series price data with timestamps
- **scrape_logs**: Monitoring and audit trail

### Scraper Architecture

All scrapers extend `BaseScraper` which provides:
- Playwright browser initialization
- Retry logic with exponential backoff
- Error handling and Winston logging
- Screenshot capture on failures

Each scraper must implement:
- `initialize()`: Setup browser, navigate to site
- `scrapeProductList()`: Get product URLs/data
- `scrapeProductDetails(url)`: Extract price, name, unit, etc.
- `cleanup()`: Close browser gracefully

## HOW: Development Workflow

### Environment Setup

1. **Database is required**: PostgreSQL must be running before any database operations
   ```bash
   docker-compose up -d  # Starts PostgreSQL on localhost:5432
   ```

2. **First-time setup sequence**:
   ```bash
   npm install
   npx playwright install chromium
   npm run migrate  # Creates all tables
   npm run seed     # Loads initial data (countries, categories, supermarkets)
   ```

### Common Commands

```bash
npm run build         # Compile TypeScript to dist/
npm run dev          # Run main application with ts-node
npm run api          # Start Express API server (port 3000)
npm run cron         # Run scheduler for automated scraping
npm run scraper:test # Test individual scraper manually
npm test             # Run Jest tests
```

### Testing Changes

After modifying code:
1. **Scrapers**: Use `npm run scraper:test` to validate scraper logic
2. **API**: Use `npm test` or manual testing with curl/Postman
3. **Database**: Run migrations with `npm run migrate` for schema changes
4. **Build**: Run `npm run build` to verify TypeScript compiles

### Database Operations

- **Migrations**: Use `scripts/migrate.ts` for schema changes
- **Connection**: Database client is exported from `src/database/index.ts`
- **Queries**: Use the connection pool, always handle errors
- **Testing**: Docker Compose includes pgAdmin on port 5050 (admin@whereislifecheaper.com / admin)

### Important Constraints

- **Playwright headless mode**: Controlled by `PLAYWRIGHT_HEADLESS` env var (default: true)
- **Rate limiting**: Wait 1 minute between supermarket scrapes to avoid blocks
- **Retries**: Scrapers retry failed requests 3 times (configurable via `SCRAPER_MAX_RETRIES`)
- **Timeouts**: Default page timeout is 30 seconds (`SCRAPER_TIMEOUT`)
- **Concurrency**: Max 3 concurrent browsers (`SCRAPER_CONCURRENT_BROWSERS`)

### Adding a New Scraper

1. Create new scraper class in `src/scrapers/{country}/`
2. Extend `BaseScraper` and implement required methods
3. Add scraper configuration to `src/config/scrapers.ts`
4. Add supermarket seed data to `src/database/seeds/supermarkets.ts`
5. Test with `npm run scraper:test`

### Product Matching Logic

Products are matched across countries using this priority:
1. Barcode matching (if available)
2. Brand + normalized name + unit
3. Fuzzy matching within same category
4. Manual mapping in `product_mappings` table

### Environment Variables

Required variables in `.env`:
- `DATABASE_URL`: PostgreSQL connection string
- `API_PORT`: Express server port (default: 3000)
- `NODE_ENV`: development | production
- `PLAYWRIGHT_HEADLESS`: true | false
- `LOG_LEVEL`: error | warn | info | debug

### Logging

- Winston logs to `logs/` directory
- Log files rotate daily
- Scrape runs are logged to both files and `scrape_logs` table
- Use the logger from `src/utils/logger.ts` throughout the codebase

### Verification

To verify the system works end-to-end:
1. Start PostgreSQL: `docker-compose up -d`
2. Migrate and seed: `npm run migrate && npm run seed`
3. Test scraper: `npm run scraper:test`
4. Check logs in `logs/` directory
5. Query database to verify price data was saved

## Miscellaneous rules
- git commit often, after some reasonable amount of work