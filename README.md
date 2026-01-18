# WhereIsLifeCheaper

A multi-country grocery price comparison system that scrapes supermarket websites daily to help users compare the cost of living across different countries.

## Features

- **Multi-Country Comparison**: Compare grocery prices across Turkey, Montenegro, Spain, Uzbekistan, Ukraine, and Kazakhstan
- **Automated Scraping**: Daily automated scraping of supermarket websites using Playwright
- **Historical Tracking**: Track price changes over time with historical data
- **Product Matching**: Match similar products across different countries using canonical products
- **Currency Conversion**: Convert prices to a common currency for fair comparison
- **Web Dashboard**: React-based frontend for viewing comparisons
- **Admin Panel**: Manage product mappings and trigger scrapers manually
- **REST API**: Full API for programmatic access to price data

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite 7, TailwindCSS, TanStack Query |
| **Backend** | Node.js 18+, Express.js, TypeScript |
| **Scraping** | Playwright (Chromium) |
| **Database** | PostgreSQL 15 |
| **Authentication** | Google OAuth 2.0, Passport.js |
| **Logging** | Winston, Google Cloud Logging |
| **Deployment** | Vercel (Serverless) |

## Supported Supermarkets

| Country | Supermarket | Status |
|---------|-------------|--------|
| Turkey | Migros | Active |
| Montenegro | Voli | Active |
| Spain | Mercadona | Active |
| Ukraine | Auchan | Active |
| Uzbekistan | Makro | Active |
| Kazakhstan | Arbuz | Active |

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Git

### Setup

```bash
# Clone repository
git clone <repository-url>
cd whereislifecheaper

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Install Playwright
npx playwright install chromium

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start PostgreSQL
docker-compose up -d

# Run migrations and seed data
npm run migrate
npm run seed

# Start development servers
npm run api          # API on localhost:3000
npm run dev:frontend # Frontend on localhost:5173
```

### Running Scrapers

```bash
# Run all scrapers
npm run scraper:run

# Run specific scraper
npm run scraper:run -- migros

# Test a scraper
npm run scraper:test -- migros
```

## Documentation

Detailed documentation is available in the [docs/](docs/) folder:

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System architecture and component overview |
| [Database Schema](docs/database-schema.md) | Complete database schema documentation |
| [API Reference](docs/api-reference.md) | REST API endpoints and usage |
| [Scrapers](docs/scrapers.md) | Scraper architecture and development guide |
| [Deployment](docs/deployment.md) | Deployment guide for Vercel and local |
| [Development](docs/development.md) | Development setup and workflow |
| [Frontend](docs/frontend.md) | React frontend documentation |

## Project Structure

```
whereislifecheaper/
├── api/                    # Vercel serverless entry
├── docs/                   # Documentation
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── context/       # React context
│   │   ├── pages/         # Page components
│   │   └── services/      # API client
│   └── package.json
├── scripts/                # CLI scripts
├── src/                    # Backend source
│   ├── api/               # Express routes
│   ├── auth/              # Authentication
│   ├── config/            # Configuration
│   ├── database/          # Migrations & seeds
│   ├── scrapers/          # Web scrapers
│   ├── services/          # Business logic
│   ├── types/             # TypeScript types
│   └── utils/             # Utilities
├── tests/                  # Test files
├── docker-compose.yml      # Local PostgreSQL
└── vercel.json            # Vercel config
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/countries` | List all countries |
| GET | `/api/supermarkets` | List supermarkets |
| GET | `/api/products` | Search products |
| GET | `/api/prices/latest` | Get latest prices |
| GET | `/api/canonical` | List canonical products |
| GET | `/api/rates` | Get exchange rates |
| GET | `/health` | Health check |

### Admin Endpoints (Requires Authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/canonical` | Create canonical product |
| PUT | `/api/canonical/:id` | Update canonical product |
| POST | `/api/canonical/map` | Link product to canonical |
| POST | `/api/scraper/trigger` | Trigger scraper manually |
| POST | `/api/rates/sync` | Sync exchange rates |

See [API Reference](docs/api-reference.md) for complete documentation.

## Database Schema

Core tables:

- **countries** - Supported countries (TR, ME, ES, UZ, UA, KZ)
- **supermarkets** - Supermarket chains with scraper configs
- **products** - Master product catalog
- **product_mappings** - Links products to supermarkets
- **prices** - Historical price data
- **canonical_products** - Cross-country product identifiers
- **exchange_rates** - Currency conversion rates
- **scrape_logs** - Scraper execution logs

See [Database Schema](docs/database-schema.md) for complete documentation.

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
SESSION_SECRET=your-secret-key

# Optional
API_PORT=3000
NODE_ENV=development
PLAYWRIGHT_HEADLESS=true
SCRAPER_MAX_RETRIES=3
LOG_LEVEL=info

# OAuth (for authentication)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
ADMIN_EMAILS=admin@example.com
```

## Development

### NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build TypeScript and frontend |
| `npm run api` | Start API server |
| `npm run dev:frontend` | Start frontend dev server |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed initial data |
| `npm run scraper:run` | Run all scrapers |
| `npm run scraper:test` | Test scraper |
| `npm test` | Run tests |

### Adding a New Scraper

1. Create scraper class extending `BaseScraper`
2. Register in `scraperRegistry.ts`
3. Add supermarket seed data
4. Test with `npm run scraper:test -- <name>`

See [Scrapers Guide](docs/scrapers.md) for detailed instructions.

## Deployment

### Vercel (Recommended)

1. Connect repository to Vercel
2. Configure environment variables
3. Deploy

See [Deployment Guide](docs/deployment.md) for detailed instructions.

### GitHub Actions (Scrapers)

Scrapers run via GitHub Actions for scheduled execution:

```yaml
on:
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM UTC
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

See [Development Guide](docs/development.md) for coding standards.

## License

MIT

## Contact

For questions or support, please open an issue on GitHub.
