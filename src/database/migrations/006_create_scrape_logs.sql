-- Migration: Create scrape_logs table
-- Description: Tracks scraping runs for monitoring and debugging

CREATE TABLE IF NOT EXISTS scrape_logs (
    id SERIAL PRIMARY KEY,
    supermarket_id INTEGER NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
    products_scraped INTEGER DEFAULT 0,
    products_failed INTEGER DEFAULT 0,
    error_message TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for scrape logs
CREATE INDEX IF NOT EXISTS idx_scrape_logs_supermarket ON scrape_logs(supermarket_id);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_started_at ON scrape_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_status ON scrape_logs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_supermarket_started ON scrape_logs(supermarket_id, started_at DESC);

-- Comments
COMMENT ON TABLE scrape_logs IS 'Logs of all scraping operations for monitoring';
COMMENT ON COLUMN scrape_logs.status IS 'Status: running, success, failed, partial';
COMMENT ON COLUMN scrape_logs.products_scraped IS 'Number of products successfully scraped';
COMMENT ON COLUMN scrape_logs.products_failed IS 'Number of products that failed to scrape';
COMMENT ON COLUMN scrape_logs.duration_seconds IS 'Total time taken for the scraping run';
