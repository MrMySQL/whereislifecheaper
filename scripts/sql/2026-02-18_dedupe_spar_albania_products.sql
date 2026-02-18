-- Deduplicate SPAR Albania (supermarket_id = 247) products/mappings created by legacy NULL external_id flow.
-- Preserves price history by re-pointing prices to keeper mappings.
-- Preserves canonical links by moving canonical_product_id from duplicate products to keeper products when needed.
-- Keeper rule: newest mapping per normalized URL (trimmed trailing slash), using highest product_mappings.id.

BEGIN;

-- 1) Rank SPAR mappings by normalized URL.
CREATE TEMP TABLE spar_ranked_mappings AS
SELECT
  pm.id AS mapping_id,
  pm.product_id,
  pm.supermarket_id,
  pm.url,
  TRIM(TRAILING '/' FROM pm.url) AS normalized_url,
  ROW_NUMBER() OVER (
    PARTITION BY pm.supermarket_id, TRIM(TRAILING '/' FROM pm.url)
    ORDER BY pm.id DESC
  ) AS row_num
FROM product_mappings pm
WHERE pm.supermarket_id = 247;

-- 2) Build duplicate -> keeper pairs.
CREATE TEMP TABLE spar_duplicate_mappings AS
SELECT
  dup.mapping_id AS duplicate_mapping_id,
  dup.product_id AS duplicate_product_id,
  keep.mapping_id AS keeper_mapping_id,
  keep.product_id AS keeper_product_id,
  keep.normalized_url
FROM spar_ranked_mappings dup
JOIN spar_ranked_mappings keep
  ON keep.supermarket_id = dup.supermarket_id
 AND keep.normalized_url = dup.normalized_url
 AND keep.row_num = 1
WHERE dup.row_num > 1;

-- 3) Preserve canonical links when keeper product is missing one.
UPDATE products keeper
SET
  canonical_product_id = duplicate_product.canonical_product_id,
  updated_at = CURRENT_TIMESTAMP
FROM spar_duplicate_mappings dm
JOIN products duplicate_product
  ON duplicate_product.id = dm.duplicate_product_id
WHERE keeper.id = dm.keeper_product_id
  AND keeper.canonical_product_id IS NULL
  AND duplicate_product.canonical_product_id IS NOT NULL;

-- 4) Move price history from duplicate mappings to keeper mappings.
UPDATE prices pr
SET product_mapping_id = dm.keeper_mapping_id
FROM spar_duplicate_mappings dm
WHERE pr.product_mapping_id = dm.duplicate_mapping_id
  AND pr.product_mapping_id <> dm.keeper_mapping_id;

-- 5) Delete duplicate mappings.
DELETE FROM product_mappings pm
USING spar_duplicate_mappings dm
WHERE pm.id = dm.duplicate_mapping_id;

-- 6) Delete duplicate products that no longer have any mappings.
DELETE FROM products p
USING (
  SELECT DISTINCT duplicate_product_id
  FROM spar_duplicate_mappings
) dup_products
WHERE p.id = dup_products.duplicate_product_id
  AND NOT EXISTS (
    SELECT 1
    FROM product_mappings pm
    WHERE pm.product_id = p.id
  );

-- 7) Backfill external_id from SPAR URL slug for remaining NULL external IDs.
WITH candidates AS (
  SELECT
    pm.id,
    LOWER(substring(TRIM(TRAILING '/' FROM pm.url) FROM '/product/([^/?#]+)$')) AS slug
  FROM product_mappings pm
  WHERE pm.supermarket_id = 247
    AND pm.external_id IS NULL
    AND TRIM(TRAILING '/' FROM pm.url) ~ '/product/[^/?#]+$'
),
dedup_candidates AS (
  SELECT
    c.id,
    c.slug,
    ROW_NUMBER() OVER (PARTITION BY c.slug ORDER BY c.id DESC) AS row_num
  FROM candidates c
  WHERE c.slug IS NOT NULL
)
UPDATE product_mappings pm
SET
  external_id = dc.slug,
  updated_at = CURRENT_TIMESTAMP
FROM dedup_candidates dc
WHERE pm.id = dc.id
  AND dc.row_num = 1
  AND NOT EXISTS (
    SELECT 1
    FROM product_mappings existing
    WHERE existing.supermarket_id = 247
      AND existing.external_id = dc.slug
      AND existing.id <> pm.id
  );

COMMIT;
