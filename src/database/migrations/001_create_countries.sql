-- Migration: Create countries table
-- Description: Stores information about countries where we're comparing prices

CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(2) NOT NULL UNIQUE,
    currency_code VARCHAR(3) NOT NULL,
    flag_emoji VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_countries_updated_at
    BEFORE UPDATE ON countries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create index on country code for faster lookups
CREATE INDEX idx_countries_code ON countries(code);

-- Comments
COMMENT ON TABLE countries IS 'Stores countries where grocery prices are being compared';
COMMENT ON COLUMN countries.code IS 'ISO 3166-1 alpha-2 country code';
COMMENT ON COLUMN countries.currency_code IS 'ISO 4217 currency code';
