CREATE TABLE IF NOT EXISTS product_maintenance_policies (
  canonical_product_id INTEGER PRIMARY KEY REFERENCES canonical_products(id),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  expected_unit TEXT CHECK (expected_unit IN ('kg','l','pieces')),
  expected_quantity NUMERIC CHECK (expected_quantity > 0)
);
CREATE TABLE IF NOT EXISTS product_maintenance_runs (
  id SERIAL PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  scanned INTEGER NOT NULL DEFAULT 0, proposed INTEGER NOT NULL DEFAULT 0,
  dry_run BOOLEAN NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ, error TEXT
);
CREATE TABLE IF NOT EXISTS product_maintenance_suggestions (
  id SERIAL PRIMARY KEY, canonical_product_id INTEGER NOT NULL REFERENCES canonical_products(id),
  mapping_id INTEGER NOT NULL REFERENCES product_mappings(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  country_id INTEGER NOT NULL REFERENCES countries(id),
  supermarket_id INTEGER NOT NULL REFERENCES supermarkets(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','undone')),
  payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ,
  applied_product_updated_at TIMESTAMP,
  UNIQUE(canonical_product_id,mapping_id)
);
CREATE TABLE IF NOT EXISTS product_maintenance_reviews (
  id SERIAL PRIMARY KEY, suggestion_id INTEGER NOT NULL REFERENCES product_maintenance_suggestions(id),
  action TEXT NOT NULL CHECK(action IN ('approve','reject','undo')),
  actor TEXT NOT NULL, reason TEXT, before_canonical_id INTEGER, after_canonical_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_suggestions_status ON product_maintenance_suggestions(status,country_id);

CREATE TABLE IF NOT EXISTS product_maintenance_checks (
 canonical_product_id INTEGER NOT NULL REFERENCES canonical_products(id),
 supermarket_id INTEGER NOT NULL REFERENCES supermarkets(id),
 checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(canonical_product_id,supermarket_id)
);

ALTER TABLE product_maintenance_policies ADD COLUMN IF NOT EXISTS excluded_terms TEXT[] NOT NULL DEFAULT '{}';
