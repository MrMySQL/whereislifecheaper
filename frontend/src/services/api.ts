import axios from 'axios';
import type { User, Country, CanonicalProduct, CanonicalProductBasic, PriceStats, Product, AuthStatus, Supermarket, PriceHistoryEntry } from '../types';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Auth API
export const authApi = {
  getMe: async (): Promise<User | null> => {
    const response = await api.get<{ data: User | null }>('/auth/me');
    return response.data.data;
  },
  getStatus: async (): Promise<AuthStatus> => {
    const response = await api.get<AuthStatus>('/auth/status');
    return response.data;
  },
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },
};

// Countries API
export const countriesApi = {
  getAll: async (): Promise<Country[]> => {
    const response = await api.get<{ data: Country[] }>('/countries');
    return response.data.data;
  },
  getById: async (id: number): Promise<Country> => {
    const response = await api.get<{ data: Country }>(`/countries/${id}`);
    return response.data.data;
  },
};

// Supermarkets API
export const supermarketsApi = {
  getByCountry: async (countryId: number): Promise<Supermarket[]> => {
    const response = await api.get<{ data: Supermarket[] }>('/supermarkets', {
      params: { country_id: countryId },
    });
    return response.data.data;
  },
};

// Prices API
export const pricesApi = {
  getStats: async (): Promise<PriceStats[]> => {
    const response = await api.get<{ data: PriceStats[] }>('/prices/stats');
    return response.data.data;
  },
};

// Canonical Products API
export const canonicalApi = {
  getAll: async (search?: string): Promise<CanonicalProductBasic[]> => {
    const params = search ? { search } : {};
    const response = await api.get<{ data: CanonicalProductBasic[] }>('/canonical', { params });
    return response.data.data;
  },
  getComparison: async (params?: { search?: string; limit?: number; offset?: number }): Promise<{
    data: CanonicalProduct[];
    total: number;
  }> => {
    const response = await api.get<{ data: CanonicalProduct[]; total: number }>('/canonical/comparison', { params });
    return response.data;
  },
  create: async (data: { name: string; description?: string; category_id?: number }): Promise<CanonicalProductBasic> => {
    const response = await api.post<{ data: CanonicalProductBasic }>('/canonical', data);
    return response.data.data;
  },
  link: async (product_id: number, canonical_product_id: number | null): Promise<void> => {
    await api.put('/canonical/link', { product_id, canonical_product_id });
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/canonical/${id}`);
  },
  update: async (id: number, data: { show_per_unit_price?: boolean; disabled?: boolean }): Promise<CanonicalProductBasic> => {
    const response = await api.patch<{ data: CanonicalProductBasic }>(`/canonical/${id}`, data);
    return response.data.data;
  },
  getProductsByCountry: async (countryId: number, params?: { search?: string; supermarket_id?: number; limit?: number; offset?: number }): Promise<{
    data: Product[];
    count: number;
  }> => {
    const response = await api.get<{ data: Product[]; count: number }>(`/canonical/products-by-country/${countryId}`, { params });
    return response.data;
  },
};

// Products API
export const productsApi = {
  getPriceHistory: async (productId: number, days: number = 30): Promise<{
    data: PriceHistoryEntry[];
    count: number;
  }> => {
    const response = await api.get(`/products/${productId}/price-history`, {
      params: { days },
    });
    return response.data;
  },
};

// Exchange Rates API
export interface ExchangeRatesResponse {
  data: Record<string, number>;
  source: string;
  last_updated: string | null;
}

export const ratesApi = {
  getRates: async (): Promise<ExchangeRatesResponse> => {
    const response = await api.get<ExchangeRatesResponse>('/rates');
    return response.data;
  },
};

// Scraper API (admin only)
export const scraperApi = {
  trigger: async (supermarket_id?: number, categories?: string[]): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>('/scraper/trigger', { supermarket_id, categories });
    return response.data;
  },
  getStatus: async (): Promise<{
    status: string;
    running_scrapers: unknown[];
    recent_logs: unknown[];
    stats_24h: {
      success_24h: number;
      failed_24h: number;
      products_24h: number;
      currently_running: number;
    };
  }> => {
    const response = await api.get('/scraper/status');
    return response.data;
  },
  getLogs: async (params?: { supermarket_id?: number; status?: string; limit?: number; offset?: number }) => {
    const response = await api.get('/scraper/logs', { params });
    return response.data;
  },
};

export default api;
