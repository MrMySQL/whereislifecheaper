# Development Guide

This document provides guidelines for developing and contributing to WhereIsLifeCheaper.

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- Docker and Docker Compose
- Git
- VS Code (recommended) with extensions:
  - TypeScript
  - ESLint
  - Prettier
  - Playwright Test for VSCode

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd whereislifecheaper

# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install Playwright browsers
npx playwright install chromium

# Copy environment file
cp .env.example .env

# Start PostgreSQL
docker-compose up -d

# Run migrations
npm run migrate

# Seed initial data
npm run seed
```

### Development Servers

```bash
# Start API server (watches for changes)
npm run api

# In another terminal, start frontend
npm run dev:frontend
```

Access:
- Frontend: http://localhost:5173
- API: http://localhost:3000
- pgAdmin: http://localhost:5050

## Project Structure

```
whereislifecheaper/
├── api/                    # Vercel serverless entry point
│   └── index.ts
├── docs/                   # Documentation
├── frontend/               # React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── context/       # React context providers
│   │   ├── pages/         # Page components
│   │   ├── services/      # API client
│   │   └── utils/         # Helper functions
│   ├── index.html
│   └── package.json
├── scripts/                # CLI scripts
│   ├── migrate.ts         # Database migrations
│   ├── seed.ts            # Data seeding
│   ├── run-scraper.ts     # Scraper execution
│   ├── test-scraper.ts    # Scraper testing
│   └── sync-exchange-rates.ts
├── src/                    # Backend source code
│   ├── api/               # Express routes
│   │   ├── routes/        # Route handlers (7 modules)
│   │   └── server.ts      # Express setup
│   ├── auth/              # Authentication
│   │   ├── middleware.ts  # Auth middleware
│   │   ├── passport.ts    # OAuth setup
│   │   ├── routes.ts      # Auth routes
│   │   └── types.ts       # User types
│   ├── config/            # Configuration
│   │   ├── database.ts    # DB connection
│   │   └── env.ts         # Environment validation
│   ├── constants/         # Constants
│   │   └── exchangeRates.ts
│   ├── database/          # Database layer
│   │   ├── migrations/    # SQL migrations (12 files)
│   │   └── seeds/         # Seed data
│   ├── scrapers/          # Web scrapers (12 implementations)
│   │   ├── base/          # BaseScraper, ScraperFactory
│   │   ├── turkey/        # MigrosScraper
│   │   ├── montenegro/    # VoliScraper
│   │   ├── spain/         # MercadonaScraper
│   │   ├── uzbekistan/    # MakroScraper
│   │   ├── ukraine/       # AuchanUaScraper, AuchanUaGraphQLScraper
│   │   ├── kazakhstan/    # ArbuzScraper
│   │   ├── germany/       # ReweScraper, KnusprScraper
│   │   ├── malaysia/      # LotussScraper, LotussApiScraper
│   │   └── scraperRegistry.ts
│   ├── services/          # Business logic
│   │   ├── ProductService.ts
│   │   └── ScraperService.ts
│   ├── types/             # TypeScript types
│   └── utils/             # Utilities
│       ├── logger.ts      # Winston logging
│       ├── normalizer.ts  # Text normalization
│       └── retry.ts       # Retry logic
├── tests/                  # Test files
│   ├── unit/
│   └── integration/
├── logs/                   # Log files (gitignored)
├── docker-compose.yml      # Local PostgreSQL
├── tsconfig.json           # TypeScript config
├── package.json            # Dependencies & scripts
└── vercel.json            # Vercel deployment
```

## NPM Scripts

### Build & Run

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript and build frontend |
| `npm run build:backend` | Compile TypeScript only |
| `npm run build:frontend` | Build frontend with Vite |
| `npm run dev` | Run main application with ts-node |
| `npm run api` | Start Express API server |
| `npm run dev:frontend` | Start Vite dev server |
| `npm start` | Run production server |

### Database

| Script | Description |
|--------|-------------|
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed initial data |

### Scrapers

| Script | Description |
|--------|-------------|
| `npm run scraper:run` | Run all active scrapers |
| `npm run scraper:run -- <name>` | Run specific scraper |
| `npm run scraper:run -- --categories=x,y` | Run with category filter |
| `npm run scraper:run -- --concurrency=5` | Custom concurrency |
| `npm run scraper:run -- -l` | List available categories |
| `npm run scraper:test` | Test scraper manually |
| `npm run rates:sync` | Sync exchange rates |

### Docker & AWS

| Script | Description |
|--------|-------------|
| `npm run docker:build` | Build Docker image |
| `npm run docker:run` | Run Docker container locally |
| `npm run aws:deploy` | Deploy to AWS ECR |
| `npm run aws:run` | Trigger AWS ECS task |
| `npm run aws:stop` | Stop AWS ECS task |

### Testing

| Script | Description |
|--------|-------------|
| `npm test` | Run Jest tests |
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Run integration tests |

## Code Style

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer interfaces over types for objects
- Use explicit return types on functions
- Avoid `any` - use `unknown` if type is truly unknown

```typescript
// Good
interface Product {
  id: number;
  name: string;
  price: number;
}

function getProduct(id: number): Promise<Product | null> {
  // ...
}

// Avoid
function getProduct(id: any): any {
  // ...
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `product-service.ts` |
| Classes | PascalCase | `ProductService` |
| Functions | camelCase | `findProduct` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Interfaces | PascalCase | `ProductData` |
| Types | PascalCase | `ScrapeStatus` |

### File Organization

```typescript
// src/services/ProductService.ts

// 1. Imports (external first, then internal)
import { Pool } from 'pg';
import { Product, CreateProductInput } from '../types/product.types';
import { query } from '../config/database';
import { normalizeProductName } from '../utils/normalizer';

// 2. Types specific to this file
interface ProductWithMapping extends Product {
  mappingId: number;
}

// 3. Class/functions
export class ProductService {
  // Public methods first
  async findOrCreateProduct(data: CreateProductInput): Promise<number> {
    // ...
  }

  // Private methods after
  private async findByExternalId(id: string): Promise<Product | null> {
    // ...
  }
}
```

## Database Development

### Creating Migrations

1. Create new file in `src/database/migrations/`:
   ```
   013_add_new_feature.sql
   ```

2. Write SQL:
   ```sql
   -- Migration: 013_add_new_feature.sql
   -- Description: Add new feature table

   CREATE TABLE IF NOT EXISTS new_feature (
       id SERIAL PRIMARY KEY,
       name VARCHAR(255) NOT NULL,
       created_at TIMESTAMP DEFAULT NOW()
   );

   CREATE INDEX idx_new_feature_name ON new_feature(name);
   ```

3. Run migration:
   ```bash
   npm run migrate
   ```

### Database Queries

Use the typed query function:

```typescript
import { query } from '../config/database';

interface ProductRow {
  id: number;
  name: string;
  price: number;
}

// Typed query
const products = await query<ProductRow>(
  'SELECT id, name, price FROM products WHERE category_id = $1',
  [categoryId]
);

// With transactions
import { getClient } from '../config/database';

const client = await getClient();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO products ...');
  await client.query('INSERT INTO prices ...');
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

## Scraper Development

### Testing Scrapers

```bash
# Test with limited output
npm run scraper:test -- migros

# List available categories
npm run scraper:run -- migros -l

# Run specific categories
npm run scraper:run -- migros --categories=fruits,dairy
```

### Debugging Scrapers

1. **Disable headless mode**:
   ```bash
   PLAYWRIGHT_HEADLESS=false npm run scraper:test -- migros
   ```

2. **Add logging**:
   ```typescript
   import { scraperLogger } from '../utils/logger';

   scraperLogger.debug('Product extracted', { product });
   ```

3. **Check screenshots**:
   Screenshots on errors are saved to `logs/screenshots/`

4. **Use Playwright Inspector**:
   ```bash
   PWDEBUG=1 npm run scraper:test -- migros
   ```

### Scraper Best Practices

1. **Handle dynamic content**:
   ```typescript
   await this.waitForDynamicContent(page, '.product-list');
   ```

2. **Use retry for flaky operations**:
   ```typescript
   const product = await this.retryOnFailure(
     () => this.extractProduct(element),
     { maxRetries: 3 }
   );
   ```

3. **Rate limit requests**:
   ```typescript
   await this.waitBetweenRequests(); // Random delay
   ```

4. **Log errors with context**:
   ```typescript
   this.logError(error, { category, url: page.url() });
   ```

## API Development

### Adding New Routes

1. Create route file in `src/api/routes/`:
   ```typescript
   // src/api/routes/newfeature.ts
   import { Router } from 'express';
   import { query } from '../../config/database';

   const router = Router();

   router.get('/', async (req, res) => {
     try {
       const data = await query('SELECT * FROM new_feature');
       res.json({ success: true, data });
     } catch (error) {
       res.status(500).json({ success: false, error: 'Internal error' });
     }
   });

   export default router;
   ```

2. Register in `src/api/server.ts`:
   ```typescript
   import newFeatureRoutes from './routes/newfeature';

   app.use('/api/newfeature', newFeatureRoutes);
   ```

### Authentication

```typescript
import { isAuthenticated, isAdmin } from '../../auth/middleware';

// Require login
router.get('/protected', isAuthenticated, (req, res) => {
  res.json({ user: req.user });
});

// Require admin
router.post('/admin-only', isAdmin, (req, res) => {
  // ...
});
```

## Frontend Development

### Component Structure

```typescript
// frontend/src/components/ProductCard.tsx
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  onSelect?: (product: Product) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold">{product.name}</h3>
      <p className="text-lg">{product.price} {product.currency}</p>
      {onSelect && (
        <button onClick={() => onSelect(product)}>
          Select
        </button>
      )}
    </div>
  );
}
```

### API Calls with React Query

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../services/api';

// Query
function useProducts(categoryId: number) {
  return useQuery({
    queryKey: ['products', categoryId],
    queryFn: () => api.get(`/products?category_id=${categoryId}`).then(r => r.data)
  });
}

// Mutation
function useCreateProduct() {
  return useMutation({
    mutationFn: (data: CreateProductInput) =>
      api.post('/products', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });
}
```

## Testing

### Unit Tests

```typescript
// tests/unit/normalizer.test.ts
import { normalizeProductName, parsePrice } from '../../src/utils/normalizer';

describe('normalizer', () => {
  describe('normalizeProductName', () => {
    it('should lowercase and trim', () => {
      expect(normalizeProductName('  Organic Milk  ')).toBe('organic milk');
    });

    it('should handle unicode', () => {
      expect(normalizeProductName('Süt 1L')).toBe('süt 1l');
    });
  });

  describe('parsePrice', () => {
    it('should parse European format', () => {
      expect(parsePrice('12,50 €')).toBe(12.50);
    });

    it('should parse Turkish format', () => {
      expect(parsePrice('45.90 TL')).toBe(45.90);
    });
  });
});
```

### Integration Tests

```typescript
// tests/integration/api.test.ts
import request from 'supertest';
import { app } from '../../src/api/server';

describe('API', () => {
  describe('GET /api/countries', () => {
    it('should return list of countries', async () => {
      const response = await request(app)
        .get('/api/countries')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
});
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage

# Specific file
npm test -- normalizer.test.ts
```

## Logging

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | Unrecoverable errors |
| `warn` | Recoverable issues |
| `info` | Important events |
| `debug` | Detailed debugging |

### Using Loggers

```typescript
import { apiLogger, scraperLogger } from '../utils/logger';

// API routes
apiLogger.info('Request received', { path: req.path, method: req.method });
apiLogger.error('Database error', { error: error.message });

// Scrapers
scraperLogger.info('Starting scrape', { supermarket: 'Migros' });
scraperLogger.debug('Product extracted', { product });
```

### Log Output

**Development**: Console with colors
**Production**: JSON to console and Google Cloud Logging

## Environment Variables

Create `.env` file:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whereislifecheaper

# API
API_PORT=3000
NODE_ENV=development

# Scraper
PLAYWRIGHT_HEADLESS=true
SCRAPER_MAX_RETRIES=3
SCRAPER_TIMEOUT=30000
SCRAPER_CONCURRENT_BROWSERS=3

# Logging
LOG_LEVEL=debug
LOG_DIR=./logs

# OAuth (optional for local dev)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5173/api/auth/google/callback
ADMIN_EMAILS=your@email.com

# Session
SESSION_SECRET=development-secret-change-in-production
```

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation

### Commit Messages

Follow conventional commits:

```
feat: add price history chart
fix: resolve scraper timeout issue
refactor: extract product matching logic
docs: update API documentation
chore: update dependencies
```

### Pull Requests

1. Create feature branch
2. Make changes
3. Write/update tests
4. Update documentation if needed
5. Create PR with description
6. Request review

## Troubleshooting

### Common Issues

**Port already in use**
```bash
# Find and kill process
lsof -i :3000
kill -9 <PID>
```

**Database connection failed**
```bash
# Check PostgreSQL is running
docker-compose ps

# Restart if needed
docker-compose restart postgres
```

**Playwright browser not found**
```bash
npx playwright install chromium
```

**TypeScript errors after dependency update**
```bash
rm -rf node_modules
npm install
```

### Debugging

1. **API debugging**: Use VS Code debugger with launch config
2. **Scraper debugging**: Set `PLAYWRIGHT_HEADLESS=false`
3. **Database debugging**: Use pgAdmin at localhost:5050
4. **Frontend debugging**: React DevTools + Network tab
