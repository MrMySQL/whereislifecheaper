-- Deduplicate Voli (supermarket_id = 6) mappings/products created by legacy NULL external_id flow.
-- Preserves all price history by repointing prices from duplicate mappings to keeper mappings.
-- Keeper rule: newest mapping per (supermarket_id, url), using highest product_mappings.id.

BEGIN;

-- 1) Rank mappings by URL for Voli.
CREATE TEMP TABLE voli_ranked_mappings AS
SELECT
  pm.id AS mapping_id,
  pm.product_id,
  pm.supermarket_id,
  pm.url,
  ROW_NUMBER() OVER (
    PARTITION BY pm.supermarket_id, pm.url
    ORDER BY pm.id DESC
  ) AS row_num
FROM product_mappings pm
WHERE pm.supermarket_id = 6;

-- 2) Build duplicate->keeper mapping pairs.
CREATE TEMP TABLE voli_duplicate_mappings AS
SELECT
  dup.mapping_id AS duplicate_mapping_id,
  dup.product_id AS duplicate_product_id,
  keep.mapping_id AS keeper_mapping_id
FROM voli_ranked_mappings dup
JOIN voli_ranked_mappings keep
  ON keep.supermarket_id = dup.supermarket_id
 AND keep.url = dup.url
 AND keep.row_num = 1
WHERE dup.row_num > 1;

-- 3) Move price history from duplicate mappings to keeper mappings.
UPDATE prices pr
SET product_mapping_id = vd.keeper_mapping_id
FROM voli_duplicate_mappings vd
WHERE pr.product_mapping_id = vd.duplicate_mapping_id
  AND pr.product_mapping_id <> vd.keeper_mapping_id;

-- 4) Delete duplicate mappings.
DELETE FROM product_mappings pm
USING voli_duplicate_mappings vd
WHERE pm.id = vd.duplicate_mapping_id;

-- 5) Remove orphan products left after mapping dedupe.
DELETE FROM products p
WHERE NOT EXISTS (
  SELECT 1
  FROM product_mappings pm
  WHERE pm.product_id = p.id
);

-- 6) Backfill external_id from Voli product URL format: /proizvod/<id>
UPDATE product_mappings pm
SET
  external_id = substring(pm.url FROM '/proizvod/([A-Za-z0-9_-]+)'),
  updated_at = CURRENT_TIMESTAMP
WHERE pm.supermarket_id = 6
  AND pm.external_id IS NULL
  AND pm.url ~ '/proizvod/[A-Za-z0-9_-]+';

COMMIT;

