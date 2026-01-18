# System Architecture

This document provides a comprehensive overview of the WhereIsLifeCheaper system architecture.

## Overview

WhereIsLifeCheaper is a multi-country grocery price comparison system that:
- Scrapes supermarket websites daily using browser automation
- Stores price data in PostgreSQL for historical tracking
- Provides a REST API for data access
- Offers a React frontend for price comparisons

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React + Vite)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Home Page    │  │ Country View │  │ Admin Mapping│  │ Admin Scraper│    │
│  │ (Comparison) │  │ (Products)   │  │ (Canonical)  │  │ (Trigger)    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ HTTP/REST
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Express.js + Node.js)                     │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         API Routes                                   │   │
│  │  /countries  /supermarkets  /products  /prices  /canonical  /scraper │   │
│  │  /auth/google  /auth/me  /auth/logout  /rates  /health               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                       │                                      │
│  ┌────────────────────┐    ┌─────────────────────┐    ┌────────────────┐   │
│  │  Authentication    │    │     Services        │    │   Utilities    │   │
│  │  (Passport/OAuth)  │    │  ScraperService     │    │   Logger       │   │
│  │                    │    │  ProductService     │    │   Normalizer   │   │
│  └────────────────────┘    └─────────────────────┘    │   Retry        │   │
│                                       │               └────────────────┘   │
│                                       │                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Scraper Layer                                │   │
│  │  ┌────────────┐  ┌──────────────────────────────────────────────┐    │   │
│  │  │ BaseScraper│  │          Country Scrapers                    │    │   │
│  │  │ (Abstract) │  │  Migros │ Voli │ Mercadona │ Auchan │ Arbuz  │    │   │
│  │  └────────────┘  └──────────────────────────────────────────────┘    │   │
│  │         │                                                            │   │
│  │  ┌──────────────────┐    ┌────────────────┐                          │   │
│  │  │ ScraperFactory   │    │ ScraperRegistry│                          │   │
│  │  └──────────────────┘    └────────────────┘                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE (PostgreSQL 15)                           │
│                                                                              │
│  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────────────────────┐ │
│  │countries │  │supermarkets │  │categories│  │  canonical_products      │ │
│  └──────────┘  └─────────────┘  └──────────┘  └──────────────────────────┘ │
│       │              │                │                    │                │
│       │              │                ▼                    │                │
│       │              │         ┌──────────┐               │                │
│       │              │         │ products │◀──────────────┘                │
│       │              │         └──────────┘                                 │
│       │              │                │                                     │
│       │              ▼                ▼                                     │
│       │       ┌──────────────────────────┐                                 │
│       │       │    product_mappings      │                                 │
│       │       └──────────────────────────┘                                 │
│       │                     │                                               │
│       │                     ▼                                               │
│       │              ┌──────────┐                                           │
│       └──────────────│  prices  │                                           │
│                      └──────────┘                                           │
│                                                                              │
│  ┌──────────────┐  ┌──────────┐  ┌────────────────┐                        │
│  │ scrape_logs  │  │  users   │  │ exchange_rates │                        │
│  └──────────────┘  └──────────┘  └────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 19, Vite 7, TailwindCSS | User interface |
| API | Express.js, TypeScript | REST endpoints |
| Authentication | Passport.js, Google OAuth 2.0 | User authentication |
| Scraping | Playwright (Chromium) | Browser automation |
| Database | PostgreSQL 15 | Data persistence |
| Caching | TanStack Query | Client-side caching |
| Logging | Winston, Google Cloud Logging | Monitoring |
| Deployment | Vercel (Serverless) | Production hosting |

## Component Details

### Frontend Layer

The frontend is a React Single-Page Application built with Vite:

- **State Management**: React Context for auth, TanStack Query for server state
- **Routing**: React Router v7 with protected routes
- **Styling**: TailwindCSS with responsive design
- **Charts**: Recharts for price history visualization
- **Icons**: Lucide React

Key pages:
- `/` - Price comparison across countries
- `/country/:code` - Products for a specific country
- `/admin/mapping` - Canonical product management
- `/admin/scrapers` - Manual scraper triggering

### Backend Layer

Express.js server with middleware stack:

```
Request → Helmet → CORS → JSON Parser → Session → Passport → Routes → Response
```

**Middleware:**
- `helmet` - Security headers
- `cors` - Cross-origin requests
- `express-session` - Session management with PostgreSQL store
- `passport` - OAuth authentication

**Services:**
- `ProductService` - Product CRUD and matching logic
- `ScraperService` - Scraper orchestration and execution

### Scraper Layer

Browser automation using Playwright with an abstract base class pattern:

```
                    BaseScraper (Abstract)
                           │
         ┌─────────┬───────┼───────┬─────────┐
         ▼         ▼       ▼       ▼         ▼
    MigrosScraper  Voli  Mercadona  Auchan  Arbuz
       (Turkey)   (MN)    (Spain)   (Ukraine) (KZ)
```

**BaseScraper provides:**
- Browser lifecycle management
- Retry logic with exponential backoff
- Anti-bot detection measures
- Rate limiting between requests
- Error handling and screenshots
- Statistics tracking

**ScraperFactory** creates instances from database configuration.

**ScraperRegistry** maintains available scraper implementations.

### Database Layer

PostgreSQL with connection pooling (max 20 connections):

- **Migrations**: Sequential SQL files in `src/database/migrations/`
- **Seeds**: Initial data for countries, supermarkets, categories
- **Query Interface**: Type-safe `query<T>()` function

## Data Flow

### Scraping Flow

```
1. Script/Trigger invokes ScraperService.runScraper()
         │
         ▼
2. ScraperFactory creates scraper from database config
         │
         ▼
3. Scraper.initialize() launches browser
         │
         ▼
4. Scraper.scrapeProductList() iterates categories
         │
         ├──────────────────────────────────────┐
         ▼                                      │
5. For each product:                            │
   - scrapeCategory() extracts product data     │
   - onPageScraped callback triggers            │
         │                                      │
         ▼                                      │
6. ProductService.findOrCreateProduct()         │
   - Match by external_id OR name+brand         │
   - Create/update product record               │
   - Create product_mapping                     │
   - Insert price record                        │
         │                                      │
         └──────────────────────────────────────┘
         ▼
7. Update scrape_logs with results
```

### API Request Flow

```
Request → Middleware Stack → Route Handler → Database Query → JSON Response
```

### Price Comparison Flow

```
1. Frontend requests /api/canonical with countries
         │
         ▼
2. Backend joins: canonical_products → products → product_mappings → prices
         │
         ▼
3. Groups by canonical product, country
         │
         ▼
4. Applies exchange rates for currency conversion
         │
         ▼
5. Returns comparison matrix
```

## Authentication Architecture

```
┌─────────┐       ┌─────────┐       ┌─────────┐
│ Browser │──────▶│ Express │──────▶│ Google  │
│         │       │ /auth/  │       │ OAuth   │
│         │◀──────│ google  │◀──────│ Server  │
└─────────┘       └─────────┘       └─────────┘
                        │
                        ▼
                  ┌──────────┐
                  │  users   │
                  │  table   │
                  └──────────┘
```

**Flow:**
1. User clicks "Login with Google"
2. Redirect to `/api/auth/google`
3. Google OAuth consent screen
4. Callback to `/api/auth/google/callback`
5. User created/retrieved from database
6. Session stored in PostgreSQL
7. Redirect to frontend with session cookie

**Admin Detection:**
Emails in `ADMIN_EMAILS` environment variable are flagged as admins.

## Deployment Architecture

### Vercel (Production)

```
┌─────────────────────────────────────────┐
│              Vercel Edge                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │    Static Files (React SPA)     │   │
│  │    dist/frontend/*              │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │    Serverless Function          │   │
│  │    /api/* → api/index.ts        │   │
│  │    1024MB, 30s timeout          │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│     PostgreSQL (External Service)        │
└─────────────────────────────────────────┘
```

### Local Development

```
┌──────────────┐     ┌──────────────┐
│ Vite Dev     │     │ Express API  │
│ Server :5173 │     │ Server :3000 │
└──────────────┘     └──────────────┘
        │                   │
        │                   │
        └───────────────────┘
                 │
                 ▼
        ┌──────────────┐
        │ PostgreSQL   │
        │ Docker :5432 │
        └──────────────┘
```

## Security Considerations

1. **Authentication**: Google OAuth 2.0 with secure sessions
2. **Authorization**: Admin-only routes protected by `isAdmin` middleware
3. **Headers**: Helmet middleware for security headers
4. **CORS**: Configured for allowed origins
5. **Sessions**: PostgreSQL-backed session store
6. **Input Validation**: Joi schema validation for environment variables

## Scalability

**Current Design:**
- Single PostgreSQL instance
- Serverless API (scales automatically)
- 3 concurrent scrapers maximum

**Future Considerations:**
- Read replicas for database
- Redis for session caching
- Queue-based scraper execution
- CDN for static assets

## Monitoring

1. **Application Logs**: Winston to files and Google Cloud Logging
2. **Scrape Logs**: `scrape_logs` table tracks all executions
3. **Health Endpoint**: `/health` for uptime monitoring
4. **Error Screenshots**: Captured on scraper failures

## Directory Structure

```
whereislifecheaper/
├── api/                    # Vercel serverless entry
│   └── index.ts
├── docs/                   # Documentation
├── frontend/               # React application
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
├── scripts/                # CLI scripts
│   ├── migrate.ts
│   ├── seed.ts
│   ├── run-scraper.ts
│   └── test-scraper.ts
├── src/                    # Backend source
│   ├── api/               # Express routes
│   ├── auth/              # Authentication
│   ├── config/            # Configuration
│   ├── constants/         # Constants
│   ├── database/          # Migrations & seeds
│   ├── scrapers/          # Scraper implementations
│   ├── services/          # Business logic
│   ├── types/             # TypeScript types
│   └── utils/             # Utilities
├── tests/                  # Test files
├── logs/                   # Log files (gitignored)
├── docker-compose.yml      # Local PostgreSQL
├── vercel.json            # Vercel config
└── package.json           # Root dependencies
```
