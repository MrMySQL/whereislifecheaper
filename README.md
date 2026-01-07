# WhereIsLifeCheaper

A web scraping system to compare grocery basket prices across **Turkey, Montenegro, Spain, and Uzbekistan** by automatically scraping supermarket websites daily and storing price data in a PostgreSQL database with a dashboard for visualization.

## Features

- 🌍 Multi-country price comparison (TR, ME, ES, UZ)
- 🛒 Automated daily scraping of supermarket websites
- 📊 Historical price tracking
- 🔄 Product matching across countries
- 📈 Simple web dashboard for price comparisons
- ⚡ Built with Node.js, TypeScript, Playwright, and PostgreSQL

## Tech Stack

- **Backend**: Node.js + TypeScript + Express.js
- **Scraping**: Playwright for browser automation
- **Database**: PostgreSQL 15+
- **Scheduling**: node-cron for daily automation
- **Frontend**: React + Vite (coming soon)
- **Logging**: Winston

## Project Structure

```
whereislifecheaper/
├── src/
│   ├── scrapers/          # Scraper implementations per country
│   ├── database/          # Migrations, models, seeds
│   ├── services/          # Business logic
│   ├── api/               # Express REST API
│   ├── scheduler/         # Cronjobs
│   ├── utils/             # Utilities (logger, normalizer, retry)
│   └── config/            # Configuration
├── scripts/               # Migration and seed scripts
├── logs/                  # Application logs
└── tests/                 # Unit and integration tests
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for PostgreSQL)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whereislifecheaper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Playwright browsers**
   ```bash
   npx playwright install chromium
   ```

4. **Setup environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

5. **Start PostgreSQL with Docker**
   ```bash
   docker-compose up -d
   ```

   This will start:
   - PostgreSQL on `localhost:5432`
   - pgAdmin on `localhost:5050` (admin@whereislifecheaper.com / admin)

6. **Run database migrations**
   ```bash
   npm run migrate
   ```

7. **Seed initial data**
   ```bash
   npm run seed
   ```

### Development

```bash
# Start the API server
npm run api

# Test a scraper manually
npm run scraper:test

# Run cronjobs
npm run cron

# Build TypeScript
npm run build

# Run in development mode
npm run dev
```

## Database Schema

### Core Tables

- **countries** - Turkey, Montenegro, Spain, Uzbekistan
- **supermarkets** - Supermarket chains with scraper configurations
- **categories** - Product categories
- **products** - Master product catalog with normalized names
- **product_mappings** - Links products to supermarkets
- **prices** - Historical price data
- **scrape_logs** - Scraping run logs for monitoring

## Supermarkets

### Turkey 🇹🇷
- ✅ Migros (active)
- A101 (planned)
- BIM (planned)
- ŞOK (planned)
- CarrefourSA (planned)

### Montenegro 🇲🇪
- Voli (planned)
- Idea (planned)

### Spain 🇪🇸
- Mercadona (planned)
- Carrefour (planned)
- Alcampo (planned)
- Dia (planned)

### Uzbekistan 🇺🇿
- Korzinka (planned)

## API Endpoints

```
GET /api/countries                     # List all countries
GET /api/supermarkets                  # List all supermarkets
GET /api/products                      # List products with filters
GET /api/products/:id                  # Get product details
GET /api/prices/latest                 # Get latest prices
GET /api/prices/history/:productId     # Price history for a product
GET /api/comparisons/basket            # Compare shopping basket across countries
```

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
SCRAPER_CONCURRENT_BROWSERS=3

# Logging
LOG_LEVEL=info
LOG_DIR=./logs
```

## Scraping Architecture

### BaseScraper

All scrapers extend the `BaseScraper` abstract class which provides:
- Browser initialization with Playwright
- Retry logic for failed requests
- Error handling and logging
- Screenshot capture on errors

### Adding a New Scraper

1. Create a new scraper class in `src/scrapers/{country}/`
2. Extend `BaseScraper`
3. Implement required methods:
   - `initialize()`
   - `scrapeProductList()`
   - `scrapeProductDetails(url)`
   - `cleanup()`
4. Add configuration to `src/config/scrapers.ts`
5. Update seed data in `src/database/seeds/supermarkets.ts`

## Product Matching

Products are matched across countries using:
1. **Barcode matching** (highest confidence)
2. **Brand + normalized name + unit** (high confidence)
3. **Fuzzy matching within category** (medium confidence)
4. **Manual mapping** for common products

## Daily Cronjob

The system runs a daily scraper at 2 AM UTC that:
1. Gets all active supermarkets
2. For each supermarket:
   - Creates scraper instance
   - Scrapes all products
   - Saves prices with timestamps
   - Logs scrape status
3. Waits 1 minute between supermarkets to avoid rate limiting

## Monitoring

- All scraping runs are logged to `scrape_logs` table
- Winston logs to `logs/` directory
- Health check endpoint at `/api/admin/health`

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Test specific scraper
npm run scraper:test -- --scraper=migros
```

## Roadmap

- [x] Project setup and database schema
- [x] Base scraper architecture
- [ ] Migros Turkey scraper
- [ ] Additional scrapers (1 per country)
- [ ] Product matching algorithm
- [ ] REST API
- [ ] Frontend dashboard
- [ ] Price trend analysis
- [ ] Currency conversion
- [ ] Mobile app

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Contact

For questions or support, please open an issue on GitHub.
