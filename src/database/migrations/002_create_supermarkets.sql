-- Migration: Create supermarkets table
-- Description: Stores information about supermarket chains we're scraping

CREATE TABLE IF NOT EXISTS supermarkets (
    id SERIAL PRIMARY KEY,
    country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    website_url TEXT NOT NULL,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    scraper_class VARCHAR(100) NOT NULL,
    scraper_config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(country_id, name)
);

-- Create trigger to automatically update updated_at timestamp
DROP TRIGGER IF EXISTS update_supermarkets_updated_at ON supermarkets;
CREATE TRIGGER update_supermarkets_updated_at
    BEFORE UPDATE ON supermarkets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_supermarkets_country ON supermarkets(country_id);
CREATE INDEX IF NOT EXISTS idx_supermarkets_is_active ON supermarkets(is_active);
CREATE INDEX IF NOT EXISTS idx_supermarkets_scraper_class ON supermarkets(scraper_class);

-- Comments
COMMENT ON TABLE supermarkets IS 'Stores supermarket chains and their scraping configuration';
COMMENT ON COLUMN supermarkets.scraper_class IS 'Name of the TypeScript class used to scrape this supermarket';
COMMENT ON COLUMN supermarkets.scraper_config IS 'JSON configuration for selectors and scraping parameters';
COMMENT ON COLUMN supermarkets.is_active IS 'Whether scraping is enabled for this supermarket';
