-- Create exchange_rates table to store currency exchange rates to EUR
-- Rates are fetched periodically from frankfurter.app (ECB data)

CREATE TABLE IF NOT EXISTS exchange_rates (
    id SERIAL PRIMARY KEY,
    currency_code VARCHAR(3) NOT NULL,
    rate_to_eur DECIMAL(20, 10) NOT NULL,  -- How many EUR for 1 unit of currency
    source VARCHAR(50) NOT NULL DEFAULT 'frankfurter',  -- 'frankfurter' or 'fallback'
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by currency
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency ON exchange_rates(currency_code);

-- Index for fetching latest rates
CREATE INDEX IF NOT EXISTS idx_exchange_rates_fetched_at ON exchange_rates(fetched_at DESC);

-- View for easy querying of latest rates per currency
CREATE OR REPLACE VIEW latest_exchange_rates AS
SELECT DISTINCT ON (currency_code)
    currency_code,
    rate_to_eur,
    source,
    fetched_at
FROM exchange_rates
ORDER BY currency_code, fetched_at DESC;
