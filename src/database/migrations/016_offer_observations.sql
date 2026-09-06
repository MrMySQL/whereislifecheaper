-- Offer observation state is independent of canonical classification.
-- Historical booleans were often hardcoded true, so do not backfill availability.
ALTER TABLE product_mappings
  ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (availability_status IN ('available', 'out_of_stock', 'unknown')),
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_available_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS quantity_info JSONB,
  ADD COLUMN IF NOT EXISTS raw_observation JSONB,
  ADD COLUMN IF NOT EXISTS duplicate_of_mapping_id INTEGER REFERENCES product_mappings(id) ON DELETE SET NULL
    CHECK (duplicate_of_mapping_id <> id);

-- Preserve interpretation with the observation's price. Later package changes
-- must never reinterpret a historical price using the product's current size.
ALTER TABLE prices ADD COLUMN IF NOT EXISTS quantity_info JSONB;
CREATE INDEX IF NOT EXISTS idx_mapping_availability_checked
  ON product_mappings(supermarket_id, availability_status, last_checked_at DESC);
COMMENT ON COLUMN product_mappings.last_checked_at IS 'Last explicit observation, including out-of-stock; missing from a scrape does not update this.';
COMMENT ON COLUMN product_mappings.last_available_at IS 'Last explicit in-stock observation, distinct from last usable price.';
COMMENT ON COLUMN product_mappings.quantity_info IS 'Derived package contents and price basis with evidence; original shop unit remains on products.';
COMMENT ON COLUMN prices.quantity_info IS 'Immutable quantity interpretation for this price observation; NULL historical entries remain uninterpreted.';
