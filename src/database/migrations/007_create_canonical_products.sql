-- Migration: Create canonical_products table and link to products
-- Description: Canonical products are shared identifiers that allow matching products across countries

-- Canonical Products Table
-- These are user-defined product identifiers like "Milk 1L", "Bread 500g", etc.
CREATE TABLE IF NOT EXISTS canonical_products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to automatically update updated_at timestamp
DROP TRIGGER IF EXISTS update_canonical_products_updated_at ON canonical_products;
CREATE TRIGGER update_canonical_products_updated_at
    BEFORE UPDATE ON canonical_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create index for name search
CREATE INDEX IF NOT EXISTS idx_canonical_products_name ON canonical_products(name);
CREATE INDEX IF NOT EXISTS idx_canonical_products_category ON canonical_products(category_id);

-- Add canonical_product_id to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS canonical_product_id INTEGER REFERENCES canonical_products(id) ON DELETE SET NULL;

-- Create index for the foreign key
CREATE INDEX IF NOT EXISTS idx_products_canonical ON products(canonical_product_id);

-- Comments
COMMENT ON TABLE canonical_products IS 'User-defined product identifiers for matching products across countries';
COMMENT ON COLUMN canonical_products.name IS 'Display name like "Milk 1L", "Bread 500g"';
COMMENT ON COLUMN products.canonical_product_id IS 'Links to canonical product for cross-country matching';
