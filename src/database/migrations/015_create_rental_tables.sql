-- Rent feature: raw listings (one row per listing per scrape) and the
-- pre-aggregated pooled medians the API serves. Listings are NOT products;
-- they do not reuse the grocery products/prices schema.

CREATE TABLE IF NOT EXISTS rental_listings (
    id SERIAL PRIMARY KEY,
    country_id INTEGER NOT NULL REFERENCES countries(id),
    city VARCHAR(100) NOT NULL,
    source VARCHAR(20) NOT NULL,                 -- e.g. 'olx', 'domria', 'flatfy', 'realestateau', 'domainau'
    source_listing_id TEXT NOT NULL,             -- site's own id (parsed from URL)
    bedrooms INTEGER NOT NULL,                   -- rooms - 1 (studio = 0)
    sqm NUMERIC(10, 2),
    price_original NUMERIC(14, 2) NOT NULL,      -- monthly rent in the listed currency
    currency_original VARCHAR(3) NOT NULL,       -- listed currency (UAH/USD/EUR)
    price_local NUMERIC(14, 2) NOT NULL,         -- monthly rent normalized to the country's currency
    district TEXT,
    listed_at TIMESTAMP WITH TIME ZONE,
    scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    scraped_on DATE NOT NULL DEFAULT CURRENT_DATE,  -- plain date column for an
                                                    -- immutable dedup index
    raw_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Re-running a scrape on the same day is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_listings_dedup
    ON rental_listings (source, source_listing_id, scraped_on);

CREATE INDEX IF NOT EXISTS idx_rental_listings_country_scraped
    ON rental_listings (country_id, scraped_at DESC);

CREATE TABLE IF NOT EXISTS rental_stats (
    id SERIAL PRIMARY KEY,
    country_id INTEGER NOT NULL REFERENCES countries(id),
    city VARCHAR(100) NOT NULL,
    bedrooms INTEGER NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    median NUMERIC(14, 2) NOT NULL,              -- pooled median in the country's currency
    currency VARCHAR(3) NOT NULL,
    n_listings INTEGER NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_stats_period
    ON rental_stats (country_id, city, bedrooms, period_end);
