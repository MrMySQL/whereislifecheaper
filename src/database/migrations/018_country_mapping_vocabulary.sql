-- Generated search vocabulary is scoped to a country; it is not an approved mapping.
CREATE TABLE IF NOT EXISTS product_mapping_vocabulary (
 canonical_product_id INTEGER NOT NULL REFERENCES canonical_products(id),
 country_id INTEGER NOT NULL REFERENCES countries(id),
 source_name TEXT NOT NULL,
 aliases TEXT[] NOT NULL DEFAULT '{}',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (canonical_product_id,country_id)
);
