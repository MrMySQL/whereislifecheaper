-- Upgrade caches created by the original migration 018 as well as fresh installs.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'product_mapping_vocabulary'::regclass
            AND conname = 'product_mapping_vocabulary_canonical_product_id_fkey' AND confdeltype <> 'c') THEN
  ALTER TABLE product_mapping_vocabulary
   DROP CONSTRAINT product_mapping_vocabulary_canonical_product_id_fkey,
   ADD CONSTRAINT product_mapping_vocabulary_canonical_product_id_fkey
    FOREIGN KEY (canonical_product_id) REFERENCES canonical_products(id) ON DELETE CASCADE;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'product_mapping_vocabulary'::regclass
            AND conname = 'product_mapping_vocabulary_country_id_fkey' AND confdeltype <> 'c') THEN
  ALTER TABLE product_mapping_vocabulary
   DROP CONSTRAINT product_mapping_vocabulary_country_id_fkey,
   ADD CONSTRAINT product_mapping_vocabulary_country_id_fkey
    FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
 END IF;
END $$;
