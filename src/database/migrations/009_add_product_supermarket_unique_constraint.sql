-- Migration: Add unique constraint on product_id and supermarket_id
-- Description: Fixes ON CONFLICT clause error by adding missing unique constraint

-- Add unique constraint on (product_id, supermarket_id)
-- This ensures a product can only have one mapping per supermarket
-- First, we need to handle any existing duplicates by keeping only the most recent one
DO $$
BEGIN
    -- Delete duplicate mappings, keeping the one with the highest id (most recent)
    DELETE FROM product_mappings pm1
    WHERE EXISTS (
        SELECT 1 FROM product_mappings pm2
        WHERE pm2.product_id = pm1.product_id
        AND pm2.supermarket_id = pm1.supermarket_id
        AND pm2.id > pm1.id
    );

    -- Now add the unique constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'product_mappings_product_supermarket_unique'
    ) THEN
        ALTER TABLE product_mappings
        ADD CONSTRAINT product_mappings_product_supermarket_unique
        UNIQUE (product_id, supermarket_id);
    END IF;
END $$;

COMMENT ON CONSTRAINT product_mappings_product_supermarket_unique ON product_mappings
    IS 'Ensures a product can only have one mapping per supermarket';
