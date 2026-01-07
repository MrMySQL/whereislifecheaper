-- Migration: Create categories table
-- Description: Stores product categories for organization and filtering

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    icon VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name)
);

-- Create index for hierarchical queries
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- Comments
COMMENT ON TABLE categories IS 'Product categories for organizing grocery items';
COMMENT ON COLUMN categories.name_en IS 'English name for cross-country matching';
COMMENT ON COLUMN categories.parent_id IS 'Parent category for hierarchical structure';
