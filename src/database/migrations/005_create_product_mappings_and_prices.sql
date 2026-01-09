-- Migration: Create product_mappings and prices tables
-- Description: Maps products to supermarkets and stores historical price data

-- Product Mappings Table
CREATE TABLE IF NOT EXISTS product_mappings (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supermarket_id INTEGER NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    url TEXT NOT NULL,
    is_available BOOLEAN DEFAULT true,
    last_scraped_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supermarket_id, external_id)
);

-- Create trigger to automatically update updated_at timestamp
DROP TRIGGER IF EXISTS update_product_mappings_updated_at ON product_mappings;
CREATE TRIGGER update_product_mappings_updated_at
    BEFORE UPDATE ON product_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for product mappings
CREATE INDEX IF NOT EXISTS idx_product_mappings_product ON product_mappings(product_id);
CREATE INDEX IF NOT EXISTS idx_product_mappings_supermarket ON product_mappings(supermarket_id);
CREATE INDEX IF NOT EXISTS idx_product_mappings_available ON product_mappings(is_available);
CREATE INDEX IF NOT EXISTS idx_product_mappings_last_scraped ON product_mappings(last_scraped_at);

-- Comments for product_mappings
COMMENT ON TABLE product_mappings IS 'Links products to specific supermarkets with URLs and external IDs';
COMMENT ON COLUMN product_mappings.external_id IS 'Supermarket-specific product identifier';
COMMENT ON COLUMN product_mappings.url IS 'Direct URL to product page on supermarket website';
COMMENT ON COLUMN product_mappings.is_available IS 'Whether product is currently available';

-- Prices Table
CREATE TABLE IF NOT EXISTS prices (
    id SERIAL PRIMARY KEY,
    product_mapping_id INTEGER NOT NULL REFERENCES product_mappings(id) ON DELETE CASCADE,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    original_price DECIMAL(10, 2),
    is_on_sale BOOLEAN DEFAULT false,
    price_per_unit DECIMAL(10, 2),
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for prices
CREATE INDEX IF NOT EXISTS idx_prices_mapping ON prices(product_mapping_id);
CREATE INDEX IF NOT EXISTS idx_prices_scraped_at ON prices(scraped_at);
CREATE INDEX IF NOT EXISTS idx_prices_currency ON prices(currency);
CREATE INDEX IF NOT EXISTS idx_prices_on_sale ON prices(is_on_sale) WHERE is_on_sale = true;

-- Create composite index for latest price queries
CREATE INDEX IF NOT EXISTS idx_prices_mapping_scraped ON prices(product_mapping_id, scraped_at DESC);

-- Comments for prices
COMMENT ON TABLE prices IS 'Historical price data for all products';
COMMENT ON COLUMN prices.original_price IS 'Original price before discount (if on sale)';
COMMENT ON COLUMN prices.is_on_sale IS 'Whether product is currently discounted';
COMMENT ON COLUMN prices.price_per_unit IS 'Calculated price per standard unit (e.g., per kg or liter)';
COMMENT ON COLUMN prices.scraped_at IS 'Timestamp when this price was collected';
