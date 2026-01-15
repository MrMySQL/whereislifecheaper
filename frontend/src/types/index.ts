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
  category: string | null;
  prices_by_country: Record<string, CountryPrice>;
  country_count: number;
}

export interface CountryPrice {
  product_id: number;
  product_name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  image_url: string | null;
  price: number;
  currency: string;
  original_price: number | null;
  is_on_sale: boolean;
  supermarket: string;
  country_name: string;
  scraped_at: string;
}

export interface PriceStats {
  country_id: number;
  country_name: string;
  country_code: string;
  currency_code: string;
  flag_emoji: string;
  supermarket_count: number;
  product_count: number;
  avg_price: number;
  last_scrape: string | null;
}

export interface Product {
  id: number;
  name: string;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  image_url: string | null;
  canonical_product_id: number | null;
  canonical_product_name: string | null;
  supermarket_id: number;
  supermarket_name: string;
  country_id: number;
  country_name: string;
  country_code: string;
  price: number | null;
  currency: string | null;
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
  created_at: string;
  linked_products_count: number;
  countries_count: number;
}
