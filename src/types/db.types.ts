export interface CountryRow {
  id: string;
  name: string;
  code: string;
  currency_code: string;
  flag_emoji: string | null;
}

export interface SupermarketRow {
  id: string;
  name: string;
  country_id: string;
  website_url: string | null;
  logo_url: string | null;
  base_url: string | null;
  scraper_class: string | null;
  scraper_config: Record<string, unknown> | null;
  is_active: boolean;
}

export interface SupermarketWithCountry extends SupermarketRow {
  country_name: string;
  country_code: string;
  currency_code: string;
}

export interface ProductRow {
  id: string;
  name: string;
  normalized_name: string;
  brand: string | null;
  category_id: string | null;
  unit: string | null;
  unit_quantity: number | null;
  image_url: string | null;
  canonical_product_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProductWithCategory extends ProductRow {
  category_name: string | null;
}

export interface ProductMappingRow {
  id: string;
  product_id: string;
  supermarket_id: string;
  external_id: string | null;
  url: string;
  is_available: boolean | null;
  last_scraped_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface MappingLookupResult {
  id: string;
  product_id: string;
  external_id: string | null;
  url: string;
}

export interface NameBrandMappingResult extends MappingLookupResult {
  lookup_normalized_name: string;
  lookup_brand: string | null;
}

export interface PriceRow {
  id: string;
  product_mapping_id: string;
  price: number;
  currency: string;
  original_price: number | null;
  is_on_sale: boolean;
  price_per_unit: number | null;
  scraped_at: Date;
}

export interface CanonicalProductRow {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  show_per_unit_price: boolean;
  disabled: boolean | null;
  created_at: Date;
}

export interface ScrapeLogRow {
  id: string;
  supermarket_id: string;
  status: string;
  products_scraped: number | null;
  products_failed: number | null;
  error_message: string | null;
  duration_seconds: number | null;
  started_at: Date;
  completed_at: Date | null;
}

export interface ExchangeRateRow {
  currency_code: string;
  rate_to_eur: string; // pg returns NUMERIC as string
  source: string;
  fetched_at: Date;
}

// ── Query result types for API responses ─────────────────────────────────

export interface ProductWithPricesResult extends ProductWithCategory {
  prices: ProductPriceEntry[];
}

export interface ProductPriceEntry {
  supermarket_id: string;
  supermarket_name: string;
  country_name: string;
  country_code: string;
  currency_code: string;
  price: number | null;
  original_price: number | null;
  is_on_sale: boolean | null;
  is_available: boolean | null;
  price_per_unit: number | null;
  scraped_at: Date | null;
  product_url: string;
}

export interface PriceHistoryEntry {
  id: string;
  product_mapping_id: string;
  price: number;
  currency: string;
  original_price: number | null;
  is_on_sale: boolean;
  price_per_unit: number | null;
  scraped_at: Date;
  product_id: string;
  supermarket_id: string;
  supermarket_name: string;
  country_name: string;
  country_code: string;
}

export interface CountryComparisonEntry {
  country_id: string;
  country_name: string;
  country_code: string;
  currency_code: string;
  supermarket_id: string;
  supermarket_name: string;
  product_id: string;
  product_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  price: number;
  price_per_unit: number | null;
  is_on_sale: boolean;
  scraped_at: Date;
}

export interface LatestPriceEntry {
  product_id: string;
  product_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  supermarket_id: string;
  supermarket_name: string;
  country_id: string;
  country_name: string;
  country_code: string;
  price: number;
  currency: string;
  original_price: number | null;
  is_on_sale: boolean;
  is_available: boolean | null;
  price_per_unit: number | null;
  scraped_at: Date;
}

export interface CountryStatsEntry {
  country_id: string;
  country_name: string;
  country_code: string;
  currency_code: string;
  flag_emoji: string | null;
  product_count: string; // COUNT returns string
  supermarket_count: string;
  last_scrape: Date | null;
}

export interface BasketEntry {
  country_id: string;
  country_name: string;
  country_code: string;
  currency_code: string;
  product_name: string;
  cheapest_price: string; // numeric cast returns string
  cheapest_supermarket: string;
}

export interface PriceCompareEntry {
  product_id: string;
  product_name: string;
  normalized_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  supermarket_id: string;
  supermarket_name: string;
  country_id: string;
  country_name: string;
  country_code: string;
  currency_code: string;
  price: number;
  currency: string;
  original_price: number | null;
  is_on_sale: boolean;
  scraped_at: Date;
}

// ── Canonical product query types ─────────────────────────────────

export interface CanonicalProductWithCounts extends CanonicalProductRow {
  category_name: string | null;
  linked_products_count: string; // COUNT returns string
  countries_count: string;
}

export interface MappedProductEntry {
  product_id: string;
  product_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  canonical_product_id: string;
  canonical_product_name: string;
  canonical_disabled: boolean | null;
  last_price_updated_at: Date | null;
  mappings_count: string;
  countries_count: string;
  markets: unknown; // JSONB aggregate
  stale_days: number | null;
}

export interface LinkedProductEntry {
  id: string;
  name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  supermarket_id: string;
  supermarket_name: string;
  country_id: string;
  country_name: string;
  country_code: string;
  currency_code: string;
  price: number | null;
  currency: string | null;
  scraped_at: Date | null;
}

export interface CanonicalComparisonRow {
  canonical_id: string;
  canonical_name: string;
  canonical_description: string | null;
  show_per_unit_price: boolean;
  category_name: string | null;
  product_id: string;
  product_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  image_url: string | null;
  product_url: string;
  supermarket_name: string;
  country_id: string;
  country_name: string;
  country_code: string;
  currency_code: string;
  price: string; // numeric comes back as string from pg
  currency: string;
  original_price: string | null;
  is_on_sale: boolean;
  scraped_at: Date;
  price_per_unit: string | null;
}

export interface CountryProductEntry {
  id: string;
  name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  image_url: string | null;
  created_at: Date;
  canonical_product_id: string | null;
  canonical_product_name: string | null;
  supermarket_id: string;
  supermarket_name: string;
  country_id: string;
  country_name: string;
  country_code: string;
  price: number | null;
  currency: string | null;
  price_updated_at: Date | null;
  last_seen_at: Date | null;
  product_url: string;
}

// ── Scrape log query types ─────────────────────────────────

export interface ScrapeLogWithSupermarket extends ScrapeLogRow {
  supermarket_name: string;
}

export interface ScrapeLogWithDetails extends ScrapeLogWithSupermarket {
  country_name: string;
}

export interface ScrapeLogWithCountryCode extends ScrapeLogWithDetails {
  country_code: string;
}

export interface ScrapeLogLatestStats {
  supermarket_name: string;
  country_name: string;
  status: string;
  products_scraped: number | null;
  duration_seconds: number | null;
  completed_at: Date | null;
}

export interface ScrapeLog24hSummary {
  success_24h: string;
  failed_24h: string;
  products_24h: string | null;
  currently_running: string;
}

// ── Supermarket query types ─────────────────────────────────

export interface SupermarketWithProductCount extends SupermarketWithCountry {
  product_count: string; // COUNT returns string
}

export interface SupermarketWithProductCountAndScrape extends SupermarketWithProductCount {
  last_scrape: Date | null;
}

export interface SupermarketBasicEntry {
  id: string;
  name: string;
  country_id: string;
  is_active: boolean;
}

export interface SupermarketForCountryEntry {
  id: string;
  name: string;
  website_url: string | null;
  logo_url: string | null;
  is_active: boolean;
}

export interface SupermarketProductEntry {
  id: string;
  name: string;
  normalized_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  image_url: string | null;
  category_name: string | null;
  product_url: string;
  price: number | null;
  currency: string | null;
  original_price: number | null;
  is_on_sale: boolean | null;
  is_available: boolean | null;
  price_per_unit: number | null;
  scraped_at: Date | null;
}
