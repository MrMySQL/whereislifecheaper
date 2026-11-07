# Database Schema

This document describes the complete PostgreSQL database schema for WhereIsLifeCheaper.

## Entity Relationship Diagram

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    countries    │      │  supermarkets   │      │   categories    │
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ id (PK)         │◀─────│ country_id (FK) │      │ id (PK)         │
│ name            │      │ id (PK)         │      │ name            │
│ code            │      │ name            │      │ name_en         │
│ currency_code   │      │ base_url        │      │ parent_id (FK)  │──┐
│ flag_emoji      │      │ logo_url        │      │ icon            │  │
│ created_at      │      │ scraper_config  │      │ created_at      │◀─┘
│ updated_at      │      │ is_active       │      │ updated_at      │
└─────────────────┘      │ created_at      │      └─────────────────┘
                         │ updated_at      │              │
                         └─────────────────┘              │
                                  │                       │
                                  │                       ▼
┌─────────────────┐      ┌─────────────────────┐  ┌─────────────────┐
│canonical_products│     │  product_mappings   │  │    products     │
├─────────────────┤      ├─────────────────────┤  ├─────────────────┤
│ id (PK)         │◀─────│ id (PK)             │  │ id (PK)         │
│ name            │      │ product_id (FK)     │─▶│ category_id(FK) │
│ description     │      │ supermarket_id (FK) │  │ canonical_id(FK)│──┐
│ show_per_unit   │      │ external_id         │  │ name            │  │
│ disabled        │      │ url                 │  │ normalized_name │  │
│ created_at      │      │ created_at          │  │ brand           │  │
│ updated_at      │      │ updated_at          │  │ unit            │  │
└─────────────────┘      └─────────────────────┘  │ unit_quantity   │  │
        │                         │               │ barcode         │  │
        │                         │               │ image_url       │  │
        │                         ▼               │ description     │  │
        │                ┌─────────────────┐      │ product_group_id│  │
        │                │     prices      │      │ created_at      │  │
        │                ├─────────────────┤      │ updated_at      │  │
        │                │ id (PK)         │      └─────────────────┘  │
        │                │ mapping_id (FK) │──────────────────────────┘
        │                │ price           │
        │                │ currency        │
        │                │ original_price  │
        │                │ is_on_sale      │
        │                │ price_per_unit  │
        │                │ scraped_at      │
        │                │ created_at      │
        │                └─────────────────┘
        │
        │
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   scrape_logs   │      │     users       │      │ exchange_rates  │
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ id (PK)         │      │ id (PK)         │      │ id (PK)         │
│ supermarket_id  │      │ google_id       │      │ base_currency   │
│ status          │      │ email           │      │ target_currency │
│ started_at      │      │ name            │      │ rate            │
│ completed_at    │      │ avatar_url      │      │ fetched_at      │
│ products_scraped│      │ is_admin        │      │ created_at      │
│ products_failed │      │ created_at      │      └─────────────────┘
│ error_message   │      │ updated_at      │
│ created_at      │      └─────────────────┘
└─────────────────┘
```

## Tables

### countries

Stores supported countries for price comparison.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| name | VARCHAR(100) | NOT NULL | Country name (e.g., "Turkey") |
| code | VARCHAR(2) | NOT NULL, UNIQUE | ISO 3166-1 alpha-2 code (e.g., "TR") |
| currency_code | VARCHAR(3) | NOT NULL | ISO 4217 currency code (e.g., "TRY") |
| flag_emoji | VARCHAR(10) | | Flag emoji (e.g., "🇹🇷") |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

**Indexes:**
- `idx_countries_code` on `code`

**Current data (10 countries):**
| Code | Name | Currency | Flag |
|------|------|----------|------|
| TR | Turkey | TRY | 🇹🇷 |
| ME | Montenegro | EUR | 🇲🇪 |
| ES | Spain | EUR | 🇪🇸 |
| UZ | Uzbekistan | UZS | 🇺🇿 |
| UA | Ukraine | UAH | 🇺🇦 |
| KZ | Kazakhstan | KZT | 🇰🇿 |
| DE | Germany | EUR | 🇩🇪 |
| MY | Malaysia | MYR | 🇲🇾 |
| AL | Albania | ALL | 🇦🇱 |
| AT | Austria | EUR | 🇦🇹 |

---

### supermarkets

Stores supermarket chains and their scraper configurations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| country_id | INTEGER | NOT NULL, FK | Reference to countries |
| name | VARCHAR(100) | NOT NULL | Supermarket name |
| base_url | VARCHAR(255) | NOT NULL | Website base URL |
| logo_url | VARCHAR(255) | | Logo image URL |
| scraper_config | JSONB | | Scraper configuration (selectors, wait times) |
| is_active | BOOLEAN | DEFAULT true | Whether scraper is enabled |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

**Indexes:**
- `idx_supermarkets_country_id` on `country_id`
- `idx_supermarkets_is_active` on `is_active`

**scraper_config JSONB structure:**
```json
{
  "scraperClass": "MigrosScraper",
  "selectors": {
    "productList": ".product-grid",
    "productItem": ".product-card",
    "productName": ".product-title",
    "productPrice": ".product-price",
    "productImage": ".product-image img"
  },
  "waitTimes": {
    "pageLoad": 3000,
    "dynamicContent": 2000,
    "betweenRequests": 1500
  },
  "maxRetries": 3,
  "timeout": 30000
}
```

---

### categories

Product categories with hierarchical support.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| name | VARCHAR(100) | NOT NULL | Category name (localized) |
| name_en | VARCHAR(100) | | English category name |
| parent_id | INTEGER | FK (self) | Parent category for hierarchy |
| icon | VARCHAR(50) | | Icon identifier for UI |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

**Indexes:**
- `idx_categories_parent_id` on `parent_id`

---

### products

Master product catalog with normalized data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| category_id | INTEGER | FK | Reference to categories |
| canonical_product_id | INTEGER | FK | Reference to canonical_products |
| name | VARCHAR(255) | NOT NULL | Original product name |
| normalized_name | VARCHAR(255) | | Normalized name for matching |
| brand | VARCHAR(100) | | Product brand |
| unit | VARCHAR(50) | | Unit type (kg, L, piece) |
| unit_quantity | DECIMAL(10,3) | | Quantity per unit |
| barcode | VARCHAR(50) | | Product barcode (EAN/UPC) |
| image_url | VARCHAR(500) | | Product image URL |
| description | TEXT | | Product description |
| product_group_id | INTEGER | | Group for related products |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

**Indexes:**
- `idx_products_category_id` on `category_id`
- `idx_products_normalized_name` on `normalized_name`
- `idx_products_barcode` on `barcode`
- `idx_products_search` - GIN index on `to_tsvector(name)` for full-text search

---

### product_mappings

Links products to specific supermarkets with external IDs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| product_id | INTEGER | NOT NULL, FK | Reference to products |
| supermarket_id | INTEGER | NOT NULL, FK | Reference to supermarkets |
| external_id | VARCHAR(100) | NOT NULL | Supermarket's product ID |
| url | VARCHAR(500) | | Product page URL |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

**Constraints:**
- UNIQUE on `(supermarket_id, external_id)` - Prevents duplicate mappings
- UNIQUE on `(product_id, supermarket_id)` - One mapping per product per supermarket

**Indexes:**
- `idx_product_mappings_product_id` on `product_id`
- `idx_product_mappings_supermarket_id` on `supermarket_id`
- `idx_product_mappings_external_id` on `external_id`

---

### prices

Price history as **periods**: one row per unbroken stretch of an unchanged price
for a product mapping (migration 020). A scrape that sees the same price moves
the newest row's `scraped_at` forward instead of adding a row; a new row starts
when any stored value changes (price, currency, original price, sale flag, unit
price, quantity interpretation), when the product was seen out of stock in
between, or when the previous sighting is older than
`PRICE_PERIOD_MAX_GAP_DAYS` (7, i.e. more than one missed 3-day scrape). See
`PriceRepository.batchInsertPrices`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| product_mapping_id | INTEGER | NOT NULL, FK | Reference to product_mappings |
| price | DECIMAL(16,2) | NOT NULL | Price during this period |
| currency | VARCHAR(3) | NOT NULL | Currency code |
| original_price | DECIMAL(16,2) | | Price before discount |
| is_on_sale | BOOLEAN | DEFAULT false | Whether on sale |
| price_per_unit | DECIMAL(16,2) | | Calculated price per kg/L |
| quantity_info | JSONB | | Quantity interpretation the price was read with |
| first_seen_at | TIMESTAMP | NOT NULL | First scrape that saw this price |
| scraped_at | TIMESTAMP | | Latest scrape that saw this price |

`scraped_at` still means "latest observation", so "newest price" and freshness
queries read it as before. Price history should use both ends of the period
(`ProductRepository.getPriceHistory` does).

**Indexes:**
- `idx_prices_mapping_scraped` on `(product_mapping_id, scraped_at DESC)`
- `idx_prices_on_sale` on `is_on_sale` (partial, sale rows only)

--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| product_mapping_id | INTEGER | NOT NULL, FK | Reference to product_mappings |
| price | DECIMAL(10,2) | NOT NULL | Current price |
| currency | VARCHAR(3) | NOT NULL | Currency code |
| original_price | DECIMAL(10,2) | | Price before discount |
| is_on_sale | BOOLEAN | DEFAULT false | Whether currently on sale |
| price_per_unit | DECIMAL(10,4) | | Calculated price per kg/L |
| scraped_at | TIMESTAMP | NOT NULL | When price was scraped |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

**Indexes:**
- `idx_prices_mapping_id` on `product_mapping_id`
- `idx_prices_scraped_at` on `scraped_at`
- `idx_prices_mapping_scraped` on `(product_mapping_id, scraped_at DESC)`

---

### canonical_products

User-defined product identifiers for cross-country comparison.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| name | VARCHAR(255) | NOT NULL, UNIQUE | Canonical name (e.g., "Milk 1L") |
| description | TEXT | | Product description |
| show_per_unit_price | BOOLEAN | DEFAULT false | Display per-unit price in comparisons |
| disabled | BOOLEAN | DEFAULT false | Hide from comparison tables |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

---

### users

User accounts for authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| google_id | VARCHAR(255) | UNIQUE | Google OAuth ID |
| email | VARCHAR(255) | NOT NULL, UNIQUE | User email |
| name | VARCHAR(255) | | Display name |
| avatar_url | VARCHAR(500) | | Profile picture URL |
| is_admin | BOOLEAN | DEFAULT false | Admin privileges |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

**Indexes:**
- `idx_users_google_id` on `google_id`
- `idx_users_email` on `email`

---

### scrape_logs

Audit trail for scraper executions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| supermarket_id | INTEGER | NOT NULL, FK | Reference to supermarkets |
| status | VARCHAR(20) | NOT NULL | running, success, failed, partial |
| started_at | TIMESTAMP | NOT NULL | Execution start time |
| completed_at | TIMESTAMP | | Execution end time |
| products_scraped | INTEGER | DEFAULT 0 | Successfully scraped count |
| products_failed | INTEGER | DEFAULT 0 | Failed product count |
| error_message | TEXT | | Error details if failed |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

**Indexes:**
- `idx_scrape_logs_supermarket_id` on `supermarket_id`
- `idx_scrape_logs_status` on `status`
- `idx_scrape_logs_started_at` on `started_at`

---

### exchange_rates

Currency conversion rates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment ID |
| base_currency | VARCHAR(3) | NOT NULL | Source currency code |
| target_currency | VARCHAR(3) | NOT NULL | Target currency code |
| rate | DECIMAL(15,6) | NOT NULL | Conversion rate |
| fetched_at | TIMESTAMP | NOT NULL | When rate was fetched |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

**Constraints:**
- UNIQUE on `(base_currency, target_currency)` - One rate per currency pair

---

### sessions

Express session storage (managed by connect-pg-simple).

| Column | Type | Description |
|--------|------|-------------|
| sid | VARCHAR | Session ID (PRIMARY KEY) |
| sess | JSON | Session data |
| expire | TIMESTAMP | Expiration time |

---

## Triggers

### update_updated_at_column

Automatically updates `updated_at` timestamp on row modification.

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
```

Applied to: `countries`, `supermarkets`, `categories`, `products`, `product_mappings`, `canonical_products`, `users`

---

## Common Queries

### Get latest prices for a country

```sql
SELECT DISTINCT ON (pm.id)
    p.name AS product_name,
    p.brand,
    s.name AS supermarket_name,
    pr.price,
    pr.currency,
    pr.scraped_at
FROM products p
JOIN product_mappings pm ON p.id = pm.product_id
JOIN supermarkets s ON pm.supermarket_id = s.id
JOIN prices pr ON pm.id = pr.product_mapping_id
WHERE s.country_id = $1
ORDER BY pm.id, pr.scraped_at DESC;
```

### Get canonical product comparison across countries

```sql
SELECT
    cp.name AS canonical_name,
    c.name AS country_name,
    c.flag_emoji,
    AVG(pr.price) AS avg_price,
    pr.currency
FROM canonical_products cp
JOIN products p ON p.canonical_product_id = cp.id
JOIN product_mappings pm ON p.id = pm.product_id
JOIN supermarkets s ON pm.supermarket_id = s.id
JOIN countries c ON s.country_id = c.id
JOIN prices pr ON pm.id = pr.product_mapping_id
WHERE cp.disabled = false
  AND pr.scraped_at > NOW() - INTERVAL '7 days'
GROUP BY cp.id, cp.name, c.id, c.name, c.flag_emoji, pr.currency
ORDER BY cp.name, c.name;
```

### Get scraper health status

```sql
SELECT
    s.name AS supermarket_name,
    sl.status,
    sl.products_scraped,
    sl.products_failed,
    sl.started_at,
    sl.completed_at,
    EXTRACT(EPOCH FROM (sl.completed_at - sl.started_at)) AS duration_seconds
FROM scrape_logs sl
JOIN supermarkets s ON sl.supermarket_id = s.id
WHERE sl.started_at > NOW() - INTERVAL '24 hours'
ORDER BY sl.started_at DESC;
```

---

## Migrations

Migrations are stored in `src/database/migrations/` and run sequentially:

| File | Description |
|------|-------------|
| 001_create_countries.sql | Countries table |
| 002_create_supermarkets.sql | Supermarkets with scraper config |
| 003_create_categories.sql | Product categories |
| 004_create_products.sql | Products with full-text search |
| 005_create_product_mappings_and_prices.sql | Mappings and prices |
| 006_create_scrape_logs.sql | Scraper audit logs |
| 007_create_canonical_products.sql | Canonical product identifiers |
| 008_create_users_and_sessions.sql | Authentication tables |
| 009_add_product_supermarket_unique_constraint.sql | Prevent duplicates |
| 010_add_show_per_unit_price_to_canonical.sql | Per-unit price display option |
| 011_create_exchange_rates.sql | Currency conversion rates |
| 012_add_disabled_to_canonical_products.sql | Disable canonical products |

Run migrations:
```bash
npm run migrate
```

---

## Seeds

Initial data is loaded via `npm run seed`:

1. **countries.ts** - 8 countries with currency codes and flag emojis
2. **supermarkets.ts** - 11+ supermarkets with scraper configurations
3. **categories.ts** - Common product categories

Seeds use `ON CONFLICT DO UPDATE` for idempotent execution (updates existing records).
