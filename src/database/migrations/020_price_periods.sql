-- Store price periods instead of one row per scrape.
--
-- Until 2026-11 every scrape appended a row per product, even when nothing
-- changed: 20M rows in eight months filled the 5 GB production volume. Now a
-- row is one unbroken period of an unchanged price:
--   first_seen_at  first scrape that saw this price
--   scraped_at     latest scrape that saw it (moved forward on each sighting)
-- scraped_at keeps its old meaning, "latest observation", so readers that
-- pick the newest row or check freshness are unaffected. See
-- PriceRepository.batchInsertPrices for when a period continues.
--
-- Runs on every `npm run migrate`, so every statement must be idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prices' AND column_name = 'first_seen_at'
  ) THEN
    ALTER TABLE prices ADD COLUMN first_seen_at TIMESTAMP;
    -- Existing rows are single observations.
    UPDATE prices SET first_seen_at = COALESCE(scraped_at, created_at, CURRENT_TIMESTAMP);
    ALTER TABLE prices
      ALTER COLUMN first_seen_at SET DEFAULT CURRENT_TIMESTAMP,
      ALTER COLUMN first_seen_at SET NOT NULL;
  END IF;
END $$;

-- created_at always equalled scraped_at; nothing reads it.
ALTER TABLE prices DROP COLUMN IF EXISTS created_at;

-- Redundant with idx_prices_mapping_scraped (its leading column), or unused.
DROP INDEX IF EXISTS idx_prices_mapping;
DROP INDEX IF EXISTS idx_prices_scraped_at;
DROP INDEX IF EXISTS idx_prices_currency;

COMMENT ON TABLE prices IS 'Price history as periods of an unchanged price per product mapping';
COMMENT ON COLUMN prices.first_seen_at IS 'First scrape that observed this price in this period';
COMMENT ON COLUMN prices.scraped_at IS 'Latest scrape that observed this price; moves forward while the price is unchanged';
