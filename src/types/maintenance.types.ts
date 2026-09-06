export interface CoverageRow {
    canonical_product_id: string;
    name: string;
    country_code?: string;
    country_id: string;
    country_name: string;
    supermarket_id: string;
    supermarket_name: string;
    mapped_count: number;
    fresh_count: number;
    status: 'covered' | 'stale' | 'missing';
}
export interface RunRow {
    id: string;
    status: 'running' | 'completed' | 'failed';
    scanned: number;
    proposed: number;
    dry_run: boolean;
    started_at: string;
    finished_at: string | null;
    error: string | null;
}
export interface Suggestion {
    id: string;
    canonical_product_id: string;
    canonical_name: string;
    country_id: string;
    supermarket_id: string;
    supermarket_name: string;
    mapping_id: string;
    product_id: string;
    product_name: string;
    status: 'pending' | 'approved' | 'rejected' | 'undone';
    payload: {
        image_url?: string;
        translated_name?: string;
        search_terms?: string[];
        quantity: unknown;
        evidence: string[];
        price: number;
        currency?: string;
        last_available_at?: string;
        url: string;
        raw?: {
            name: string;
            description?: string;
            unit?: string;
            unit_quantity?: number;
            price_basis?: Candidate['price_basis'];
        };
        availability_status?: string;
        last_checked_at?: string;
    };
    created_at: string;
    reviewed_at: string | null;
}
export interface Candidate {
    image_url?: string;
    mapping_id: string;
    product_id: string;
    name: string;
    description?: string;
    unit?: string;
    unit_quantity?: number;
    price: number;
    currency?: string;
    last_available_at?: string;
    price_basis?: 'package' | 'kg' | 'l' | 'piece' | 'unknown';
    url: string;
    canonical_product_id: string | null;
    quantity_info?: ReturnType<typeof import('../utils/productQuantity').interpretProductQuantity>;
    availability_status: string;
    last_checked_at: string;
    scraped_at: string;
}
export interface MaintenanceTarget extends CoverageRow {
    show_per_unit_price?: boolean;
    excluded_terms?: string[];
    aliases: string[];
    expected_unit: 'kg' | 'l' | 'pieces' | null;
    expected_quantity: number | null;
}

export interface MaintenancePageOptions {
    limit?: number;
    offset?: number;
}
export interface CoverageOptions extends MaintenancePageOptions {
    country?: string;
    gapsOnly?: boolean;
}
export interface CoveragePage {
    coverage: MaintenanceTarget[];
    total: number;
    counts: Record<CoverageRow['status'], number>;
    limit: number;
    offset: number;
}
export interface SuggestionPage {
    data: Suggestion[];
    count: number;
    total: number;
    limit: number;
    offset: number;
}
export class MaintenanceConflictError extends Error {
    readonly name = 'MaintenanceConflictError';
}
export class MaintenanceNotFoundError extends Error {
    readonly name = 'MaintenanceNotFoundError';
}

export interface CountryRunOptions { country?: string; cursor?: string; }
export interface MappingPreview {canonical_product_id: string; canonical_name: string; country_id: string; supermarket_id: string; product_id: string; mapping_id: string; product_name: string; payload: Suggestion["payload"];}
export interface MappingRunResult extends RunRow {next_cursor: string | null; has_more: boolean; warnings: string[]; previews: MappingPreview[];}
