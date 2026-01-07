/**
 * Type definitions for API requests and responses
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Country {
  id: number;
  name: string;
  code: string;
  currency_code: string;
  flag_emoji: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Supermarket {
  id: number;
  country_id: number;
  name: string;
  website_url: string;
  logo_url: string | null;
  is_active: boolean;
  scraper_class: string;
  scraper_config: any;
  created_at: Date;
  updated_at: Date;
}

export interface ScrapeLog {
  id: number;
  supermarket_id: number;
  started_at: Date;
  completed_at: Date | null;
  status: string;
  products_scraped: number;
  products_failed: number;
  error_message: string | null;
  duration_seconds: number | null;
  created_at: Date;
}

// Query Parameters
export interface ProductQueryParams {
  category_id?: number;
  supermarket_id?: number;
  country_id?: number;
  search?: string;
  brand?: string;
  on_sale?: boolean;
  page?: number;
  limit?: number;
  sort_by?: 'price' | 'name' | 'created_at';
  order?: 'asc' | 'desc';
}

export interface PriceHistoryParams {
  product_id: number;
  supermarket_id?: number;
  start_date?: Date;
  end_date?: Date;
}

export interface ComparisonParams {
  product_ids: number[];
  country_ids?: number[];
  supermarket_ids?: number[];
}

export interface BasketComparisonParams {
  items: Array<{
    product_id: number;
    quantity: number;
  }>;
  country_ids?: number[];
}

// Response Types
export interface PriceComparison {
  product_id: number;
  product_name: string;
  prices_by_country: Array<{
    country: Country;
    prices: Array<{
      supermarket: Supermarket;
      price: number;
      currency: string;
      is_on_sale: boolean;
      scraped_at: Date;
    }>;
    cheapest_price: number;
    average_price: number;
  }>;
}

export interface BasketComparison {
  items: Array<{
    product_id: number;
    product_name: string;
    quantity: number;
  }>;
  totals_by_country: Array<{
    country: Country;
    total_price: number;
    currency: string;
    breakdown: Array<{
      supermarket: Supermarket;
      items_found: number;
      items_total: number;
      total_price: number;
    }>;
  }>;
  cheapest_country: string;
  price_difference_percentage: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  database: boolean;
  lastScrape: {
    supermarket: string;
    timestamp: Date;
  } | null;
  uptime: number;
  timestamp: Date;
}
