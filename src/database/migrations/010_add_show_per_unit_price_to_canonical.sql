-- Add show_per_unit_price column to canonical_products
-- When enabled, prices are displayed per unit (e.g., €5.20/kg) instead of total package price
-- Only enable this when all linked products have consistent unit data

ALTER TABLE canonical_products
ADD COLUMN IF NOT EXISTS show_per_unit_price BOOLEAN DEFAULT false;
