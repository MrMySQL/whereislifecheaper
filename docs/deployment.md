# Deployment Guide

This document covers deployment options for WhereIsLifeCheaper.

## Deployment Options

| Environment | Frontend | API | Database | Scrapers |
|-------------|----------|-----|----------|----------|
| Local Dev | Vite (5173) | Express (3000) | Docker PostgreSQL | Manual |
| Vercel | Static | Serverless | External PostgreSQL | GitHub Actions |

## Local Development

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Git

### Setup Steps

1. **Clone repository**
   ```bash
   git clone <repository-url>
   cd whereislifecheaper
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

3. **Install Playwright browsers**
   ```bash
   npx playwright install chromium
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

5. **Start PostgreSQL**
   ```bash
   docker-compose up -d
   ```

6. **Run migrations and seeds**
   ```bash
   npm run migrate
   npm run seed
   ```

7. **Start development servers**
   ```bash
   # Terminal 1: API server
   npm run api

   # Terminal 2: Frontend dev server
   npm run dev:frontend
   ```

8. **Access applications**
   - Frontend: http://localhost:5173
   - API: http://localhost:3000
   - pgAdmin: http://localhost:5050

### Docker Compose Services

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: whereislifecheaper
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  pgadmin:
    image: dpage/pgadmin4
    ports:
      - "5050:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@whereislifecheaper.com
      PGADMIN_DEFAULT_PASSWORD: admin
```

---

## Vercel Deployment

### Overview

WhereIsLifeCheaper is configured for Vercel deployment with:
- Static frontend built with Vite
- Serverless API functions
- External PostgreSQL database

### Configuration Files

**vercel.json**
```json
{
  "version": 2,
  "buildCommand": "npm run migrate && npm run build",
  "outputDirectory": "dist/frontend",
  "functions": {
    "api/index.ts": {
      "memory": 1024,
      "maxDuration": 30
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Deployment Steps

1. **Create Vercel Account**
   - Sign up at https://vercel.com

2. **Connect Repository**
   - Import project from GitHub
   - Select the repository

3. **Configure Environment Variables**

   In Vercel Dashboard → Settings → Environment Variables:

   | Variable | Description |
   |----------|-------------|
   | `DATABASE_URL` | PostgreSQL connection string |
   | `NODE_ENV` | `production` |
   | `SESSION_SECRET` | Random 32+ character string |
   | `GOOGLE_CLIENT_ID` | Google OAuth client ID |
   | `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
   | `GOOGLE_CALLBACK_URL` | `https://your-domain.vercel.app/api/auth/google/callback` |
   | `ADMIN_EMAILS` | Comma-separated admin emails |

4. **Database Setup**

   Use a managed PostgreSQL service:
   - **Vercel Postgres**: Native integration
   - **Supabase**: Free tier available
   - **Railway**: Easy setup
   - **Neon**: Serverless PostgreSQL

   Example connection string:
   ```
   postgresql://user:password@host:5432/database?sslmode=require
   ```

5. **Deploy**
   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Deploy
   vercel

   # Deploy to production
   vercel --prod
   ```

6. **Run Migrations**

   Migrations run automatically during build (`npm run migrate`).

   For manual migration:
   ```bash
   # Set DATABASE_URL and run locally
   export DATABASE_URL="your-production-connection-string"
   npm run migrate
   npm run seed
   ```

### Vercel Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel Edge                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Static Files (CDN)                       │  │
│  │         dist/frontend/* (React SPA)                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Serverless Function                         │  │
│  │              /api/* → api/index.ts                    │  │
│  │                                                       │  │
│  │     ┌─────────────────────────────────────────┐      │  │
│  │     │         Express.js Application          │      │  │
│  │     │  - Authentication (Passport)            │      │  │
│  │     │  - REST API routes                      │      │  │
│  │     │  - Session management                   │      │  │
│  │     └─────────────────────────────────────────┘      │  │
│  │                                                       │  │
│  │     Memory: 1024MB    Timeout: 30s                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   External PostgreSQL                        │
│              (Vercel Postgres / Supabase / etc.)            │
└─────────────────────────────────────────────────────────────┘
```

### Serverless Considerations

1. **Cold Starts**: First request may be slower
2. **Timeouts**: Functions limited to 30 seconds
3. **Memory**: Configured at 1024MB
4. **Stateless**: No persistent connections between requests
5. **No File System**: Logs go to Cloud Logging, not files

The application detects serverless environment and adjusts:
- Uses Google Cloud Logging instead of file logging
- Session store uses PostgreSQL
- No persistent browser instances (scrapers not supported)

---

## GitHub Actions (Scrapers)

Scrapers run on GitHub Actions for reliable scheduling:

### Workflow Configuration

```yaml
# .github/workflows/scrape.yml
name: Daily Scraping

on:
  schedule:
    - cron: '0 3 * * *'  # 3 AM UTC daily
  workflow_dispatch:      # Manual trigger

jobs:
  scrape:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install chromium

      - name: Run scrapers
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NODE_ENV: production
          PLAYWRIGHT_HEADLESS: true
        run: npm run scraper:run -- --concurrency=2

      - name: Upload logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: scraper-logs
          path: logs/
          retention-days: 7
```

### Secrets Configuration

In GitHub Repository → Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Production database connection string |

### Manual Trigger

1. Go to Actions tab in GitHub
2. Select "Daily Scraping" workflow
3. Click "Run workflow"

---

## Database Services

### Vercel Postgres

Native integration with Vercel:

1. Create from Vercel Dashboard → Storage → Postgres
2. Automatically adds `DATABASE_URL` to environment
3. Connection pooling included

### Supabase

Free tier with generous limits:

1. Create project at https://supabase.com
2. Go to Settings → Database
3. Copy connection string (use "Connection pooling" for serverless)

```
postgresql://postgres:[password]@[host]:6543/postgres?pgbouncer=true
```

### Railway

Simple setup with automatic scaling:

1. Create project at https://railway.app
2. Add PostgreSQL plugin
3. Copy `DATABASE_URL` from Variables tab

### Neon

Serverless PostgreSQL with branching:

1. Create project at https://neon.tech
2. Copy connection string
3. Enable connection pooling for serverless

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `NODE_ENV` | Environment | `development` or `production` |
| `SESSION_SECRET` | Session encryption key | 32+ random characters |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `3000` | API server port |
| `PLAYWRIGHT_HEADLESS` | `true` | Browser headless mode |
| `SCRAPER_MAX_RETRIES` | `3` | Scraper retry attempts |
| `SCRAPER_TIMEOUT` | `30000` | Page load timeout (ms) |
| `SCRAPER_CONCURRENT_BROWSERS` | `3` | Parallel browser instances |
| `LOG_LEVEL` | `info` | Logging level |
| `LOG_DIR` | `./logs` | Log files directory |
| `GOOGLE_CLIENT_ID` | - | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | - | OAuth client secret |
| `GOOGLE_CALLBACK_URL` | - | OAuth callback URL |
| `ADMIN_EMAILS` | - | Comma-separated admin emails |

---

## SSL/TLS Configuration

### Database SSL

Most managed PostgreSQL services require SSL:

```
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

### HTTPS

- Vercel provides automatic HTTPS
- For custom domains, configure in Vercel Dashboard

---

## Monitoring

### Health Check

```bash
curl https://your-domain.vercel.app/health
```

Response:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

### Vercel Analytics

Enable in Vercel Dashboard → Analytics for:
- Request metrics
- Error tracking
- Performance insights

### Logging

Production logs go to:
- **Console**: Vercel function logs
- **Google Cloud Logging**: If configured

View logs:
```bash
# Vercel CLI
vercel logs

# GitHub Actions
# View in Actions tab → Job → Logs
```

---

## Troubleshooting

### Common Issues

**Database Connection Failed**
```
Error: Connection refused
```
- Check DATABASE_URL is correct
- Verify database is running
- Check SSL mode (`?sslmode=require`)

**Migrations Failed**
```
Error: relation does not exist
```
- Run migrations: `npm run migrate`
- Check migration files in order

**OAuth Redirect Error**
```
Error: redirect_uri_mismatch
```
- Verify GOOGLE_CALLBACK_URL matches Google Console
- Include full URL with protocol

**Serverless Timeout**
```
Error: Task timed out after 30 seconds
```
- Optimize database queries
- Reduce API response size
- Consider pagination

### Debug Mode

Enable verbose logging:
```bash
LOG_LEVEL=debug npm run api
```

### Database Reset

```bash
# Drop all tables (CAUTION: destroys data)
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-run migrations and seeds
npm run migrate
npm run seed
```
