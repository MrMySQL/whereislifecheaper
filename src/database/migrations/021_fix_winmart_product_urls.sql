-- WinMart product URLs were stored as https://winmart.vn/{seoName}, which
-- renders an empty page; product pages live under /products/{seoName}.
-- The scraper now writes the right URL and rewrites it on every scrape, but
-- products no longer listed would keep the broken link.
--
-- Only mappings written by WinMartScraper carry the bad shape, so scope the
-- rewrite to them rather than to any URL on the winmart.vn host.
--
-- Runs on every `npm run migrate`; the WHERE clause keeps it idempotent.

UPDATE product_mappings AS pm
SET url = 'https://winmart.vn/products/' || substr(pm.url, length('https://winmart.vn/') + 1),
    updated_at = CURRENT_TIMESTAMP
FROM supermarkets AS s
WHERE s.id = pm.supermarket_id
  AND s.scraper_class = 'WinMartScraper'
  AND pm.url LIKE 'https://winmart.vn/%'
  AND pm.url NOT LIKE 'https://winmart.vn/products/%';
