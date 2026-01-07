-- Migration: Create products table
-- Description: Stores product information for price tracking

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    brand VARCHAR(100),
    unit VARCHAR(50),
    unit_quantity DECIMAL(10, 2),
    barcode VARCHAR(50),
    image_url TEXT,
    description TEXT,
    product_group_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to automatically update updated_at timestamp
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for faster queries
CREATE INDEX idx_products_normalized_name ON products(normalized_name);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_group ON products(product_group_id);
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_brand ON products(brand) WHERE brand IS NOT NULL;

-- Create full-text search index for product names
CREATE INDEX idx_products_name_search ON products USING gin(to_tsvector('english', name));

-- Comments
COMMENT ON TABLE products IS 'Master product catalog with normalized names for matching';
COMMENT ON COLUMN products.normalized_name IS 'Lowercased, special-chars removed name for matching';
COMMENT ON COLUMN products.unit IS 'Unit of measurement: kg, g, l, ml, pieces';
COMMENT ON COLUMN products.unit_quantity IS 'Quantity in the specified unit (e.g., 1.5 for 1.5L)';
COMMENT ON COLUMN products.barcode IS 'EAN/UPC barcode if available';
COMMENT ON COLUMN products.product_group_id IS 'Groups equivalent products across supermarkets/countries';
