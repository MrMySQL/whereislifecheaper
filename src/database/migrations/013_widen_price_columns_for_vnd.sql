-- Widen price columns from DECIMAL(10,2) to DECIMAL(16,2)
-- to support high-value currencies like VND (Vietnamese Dong)
-- where price_per_unit can exceed 10^8 (e.g. 500,000 VND / 0.002 kg = 250,000,000)

ALTER TABLE prices
  ALTER COLUMN price TYPE DECIMAL(16, 2),
  ALTER COLUMN original_price TYPE DECIMAL(16, 2),
  ALTER COLUMN price_per_unit TYPE DECIMAL(16, 2);
