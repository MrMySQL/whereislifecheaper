-- WinMart product URLs were stored as https://winmart.vn/{seoName}, which
-- renders an empty page; product pages live under /products/{seoName}.
-- The scraper now writes the right URL and rewrites it on every scrape, but
-- products no longer listed would keep the broken link.
--
-- Runs on every `npm run migrate`; the WHERE clause keeps it idempotent.

UPDATE product_mappings
SET url = 'https://winmart.vn/products/' || substr(url, length('https://winmart.vn/') + 1),
    updated_at = CURRENT_TIMESTAMP
WHERE url LIKE 'https://winmart.vn/%'
  AND url NOT LIKE 'https://winmart.vn/products/%';
