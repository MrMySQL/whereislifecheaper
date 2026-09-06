import axios from 'axios';
import api from './api';

export type MaintenanceStatus = 'pending' | 'approved' | 'rejected' | 'undone';
export type CoverageStatus = 'covered' | 'stale' | 'missing';
export type AvailabilityStatus = 'available' | 'out_of_stock' | 'unknown' | 'missing';
export type MaintenanceId = number | string;

export interface QuantityInfo {
  status?: 'verified' | 'unknown' | 'conflict';
  contentQuantity?: number | null;
  contentUnit?: 'kg' | 'l' | 'pieces' | null;
  priceBasis?: 'package' | 'kg' | 'l' | 'piece' | 'unknown';
  comparablePrice?: number | null;
  evidence?: string[];
  raw?: string | null;
  normalized?: string | null;
}

export interface CoverageRow {
  canonical_product_id: MaintenanceId;
  name: string;
  country_id: MaintenanceId;
  country_name: string;
  supermarket_id: MaintenanceId;
  supermarket_name: string;
  mapped_count: number;
  fresh_count: number;
  status: CoverageStatus;
}

export interface MaintenanceRun {
  id: MaintenanceId;
  status: string;
  scanned: number;
  proposed: number;
  dry_run: boolean;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export interface MaintenanceSuggestion {
  id: MaintenanceId;
  canonical_product_id: MaintenanceId;
  canonical_name: string;
  country_id: MaintenanceId;
  country_name?: string;
  supermarket_id: MaintenanceId;
  supermarket_name: string;
  mapping_id: MaintenanceId;
  product_id: MaintenanceId;
  product_name: string;
  status: MaintenanceStatus;
  payload: {
    quantity?: QuantityInfo | string | null;
    raw_quantity?: string | null;
    raw?: {
      name: string;
      description?: string;
      unit?: string;
      unit_quantity?: number;
    };
    normalized_quantity?: string | null;
    evidence?: string[];
    reasons?: string[];
    price?: number | null;
    latest_price?: number | null;
    currency?: string | null;
    url?: string | null;
    availability_status?: AvailabilityStatus;
    last_available_at?: string | null;
  };
  created_at: string;
  reviewed_at: string | null;
}

export interface MaintenanceOverview {
  coverage: CoverageRow[];
  runs: MaintenanceRun[];
}

export function maintenanceErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const body = error.response?.data as { error?: unknown; message?: unknown } | undefined;
  const detail = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : null;
  return detail || fallback;
}

export const maintenanceApi = {
  getOverview: async (): Promise<MaintenanceOverview> => {
    const response = await api.get<MaintenanceOverview>('/maintenance/overview');
    return response.data;
  },
  getSuggestions: async (params: { status: MaintenanceStatus; country_id?: MaintenanceId }): Promise<{ data: MaintenanceSuggestion[]; count: number }> => {
    const response = await api.get<{ data: MaintenanceSuggestion[]; count: number }>('/maintenance/suggestions', { params });
    return response.data;
  },
  run: async (body: { limit?: number; dry_run?: boolean }): Promise<MaintenanceRun> => {
    const response = await api.post<MaintenanceRun>('/maintenance/run', body);
    return response.data;
  },
  review: async (id: MaintenanceId, action: 'approve' | 'reject' | 'undo', reason?: string): Promise<{ id: MaintenanceId; status: MaintenanceStatus }> => {
    const response = await api.post<{ id: MaintenanceId; status: MaintenanceStatus }>(`/maintenance/suggestions/${id}/${action}`, reason ? { reason } : {});
    return response.data;
  },
};
