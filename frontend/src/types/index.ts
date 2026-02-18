export interface User {
  id: number;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  picture_url: string | null;
}

export interface Country {
  id: number;
  name: string;
  code: string;
  currency_code: string;
  flag_emoji: string;
  supermarket_count?: number;
}

export interface Supermarket {
  id: number;
  name: string;
  country_id: number;
  website_url: string;
  logo_url: string | null;
  is_active: boolean;
}

export interface CanonicalProduct {
  canonical_id: number;
  canonical_name: string;
  canonical_description: string | null;
  show_per_unit_price: boolean;
  category: string | null;
  prices_by_country: Record<string, CountryPrice>;
  country_count: number;
}

export interface ProductDetail {
  product_id: number;
  product_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  price: number;
  price_per_unit: number | null;
  supermarket: string;
  image_url: string | null;
  product_url: string | null;
}

export interface CountryPrice {
  product_id: number;
  product_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  image_url: string | null;
  product_url: string | null;
  price: number;
  price_per_unit: number | null;
  currency: string;
  original_price: number | null;
  is_on_sale: boolean;
  supermarket: string;
  country_name: string;
  scraped_at: string;
  product_count: number;
  products?: ProductDetail[];
}

export interface PriceStats {
  country_id: number;
  country_name: string;
  country_code: string;
  currency_code: string;
  flag_emoji: string;
  supermarket_count: number;
  product_count: number;
  last_scrape: string | null;
}

export interface Product {
  id: number;
  name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  image_url: string | null;
  created_at: string | null;
  canonical_product_id: number | null;
  canonical_product_name: string | null;
  supermarket_id: number;
  supermarket_name: string;
  country_id: number;
  country_name: string;
  country_code: string;
  price: number | null;
  currency: string | null;
  price_updated_at: string | null;
  last_seen_at: string | null;
  product_url: string | null;
}

export interface AuthStatus {
  authenticated: boolean;
  isAdmin: boolean;
}

export interface CanonicalProductBasic {
  id: number;
  name: string;
  description: string | null;
  category_id: number | null;
  category_name: string | null;
  show_per_unit_price: boolean;
  disabled: boolean;
  created_at: string;
  linked_products_count: number;
  countries_count: number;
}

export interface CanonicalMappedProduct {
  product_id: number;
  product_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  canonical_product_id: number;
  canonical_product_name: string;
  canonical_disabled: boolean;
  last_price_updated_at: string | null;
  stale_days: number | null;
  mappings_count: number;
  countries_count: number;
  markets: CanonicalMappedMarket[];
}

export interface CanonicalMappedMarket {
  supermarket_id: number;
  supermarket_name: string;
  country_id: number;
  country_name: string;
  country_code: string;
  country_flag: string | null;
}

export interface PriceHistoryEntry {
  id: number;
  product_mapping_id: number;
  product_id: number;
  supermarket_id: number;
  price: number;
  currency: string;
  original_price: number | null;
  is_on_sale: boolean;
  price_per_unit: number | null;
  scraped_at: string;
  supermarket_name: string;
  country_name: string;
  country_code: string;
}
