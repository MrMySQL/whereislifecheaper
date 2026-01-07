/**
 * Type definitions for products
 */

export interface Product {
  id: number;
  name: string;
  normalized_name: string;
  category_id: number | null;
  brand: string | null;
  unit: string | null;
  unit_quantity: number | null;
  barcode: string | null;
  image_url: string | null;
  description: string | null;
  product_group_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProductMapping {
  id: number;
  product_id: number;
  supermarket_id: number;
  external_id: string | null;
  url: string;
  is_available: boolean;
  last_scraped_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProductWithMapping extends Product {
  mapping: ProductMapping;
}

export interface ProductWithPrices extends Product {
  prices: Price[];
  latestPrice?: Price;
}

export interface Price {
  id: number;
  product_mapping_id: number;
  price: number;
  currency: string;
  original_price: number | null;
  is_on_sale: boolean;
  price_per_unit: number | null;
  scraped_at: Date;
  created_at: Date;
}

export interface Category {
  id: number;
  name: string;
  name_en: string | null;
  parent_id: number | null;
  icon: string | null;
  created_at: Date;
}

export interface CreateProductInput {
  name: string;
  normalized_name: string;
  category_id?: number;
  brand?: string;
  unit?: string;
  unit_quantity?: number;
  barcode?: string;
  image_url?: string;
  description?: string;
  product_group_id?: number;
}

export interface CreateProductMappingInput {
  product_id: number;
  supermarket_id: number;
  external_id?: string;
  url: string;
  is_available: boolean;
}

export interface CreatePriceInput {
  product_mapping_id: number;
  price: number;
  currency: string;
  original_price?: number;
  is_on_sale: boolean;
  price_per_unit?: number;
  scraped_at?: Date;
}

export interface ProductMatchCriteria {
  normalized_name: string;
  brand?: string;
  unit?: string;
  unit_quantity?: number;
  barcode?: string;
}

export interface ProductGroup {
  group_id: number;
  products: Product[];
  representative_name: string;
}
