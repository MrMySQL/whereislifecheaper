-- Migration: Add composite indexes for common query patterns
-- Description: Improves performance for frequently used queries across products,
-- product_mappings, and scrape_logs tables

-- Composite index for product lookups by normalized name and brand
CREATE INDEX IF NOT EXISTS idx_products_normalized_name_brand ON products(normalized_name, brand);

-- Composite index for supermarket availability queries
CREATE INDEX IF NOT EXISTS idx_product_mappings_supermarket_available ON product_mappings(supermarket_id, is_available);

-- Composite index for scrape log queries filtered by supermarket, status, and time
CREATE INDEX IF NOT EXISTS idx_scrape_logs_supermarket_status_started ON scrape_logs(supermarket_id, status, started_at DESC);
