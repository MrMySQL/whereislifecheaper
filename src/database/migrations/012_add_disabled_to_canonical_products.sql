-- Add disabled column to canonical_products
-- When disabled, the canonical product will not appear in the comparison table

ALTER TABLE canonical_products
ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false;
