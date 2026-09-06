export interface StorageReader {
  getItem(key: string): string | null;
}

export const COUNTRY_RUN_STORAGE_PREFIX = 'product-maintenance-country-run:';

export interface CountryRunPage {
  next_cursor: string | null;
  has_more: boolean;
  scanned: number;
  proposed: number;
  warnings: string[];
  previews: unknown[];
}

export interface CountryRunSession {
  cursor: string | null;
  hasMore: boolean;
  scanned: number;
  proposed: number;
  warnings: string[];
  previewCount: number;
}

export function loadCountryRunSession(storage: StorageReader, countryId: string): CountryRunSession | null {
  try {
    const raw = storage.getItem(`${COUNTRY_RUN_STORAGE_PREFIX}${countryId}`);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const session = value as Record<string, unknown>;
    if (
      !(session.cursor === null || typeof session.cursor === 'string') ||
      typeof session.hasMore !== 'boolean' ||
      !isCount(session.scanned) ||
      !isCount(session.proposed) ||
      !isCount(session.previewCount) ||
      !Array.isArray(session.warnings) ||
      !session.warnings.every((warning) => typeof warning === 'string')
    ) return null;
    return session as unknown as CountryRunSession;
  } catch {
    return null;
  }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function accumulateCountryRun(previous: CountryRunSession | null, page: CountryRunPage, continuing: boolean): CountryRunSession {
  const base = continuing && previous
    ? previous
    : { scanned: 0, proposed: 0, warnings: [], previewCount: 0 };
  return {
    cursor: page.next_cursor,
    hasMore: page.has_more,
    scanned: base.scanned + page.scanned,
    proposed: base.proposed + page.proposed,
    warnings: [...new Set([...base.warnings, ...page.warnings])],
    previewCount: base.previewCount + page.previews.length,
  };
}

export function nextSelectedIds(selectedIds: string[], id: string, selected: boolean, limit = 50): string[] {
  if (!selected) return selectedIds.filter((selectedId) => selectedId !== id);
  if (selectedIds.includes(id) || selectedIds.length >= limit) return selectedIds;
  return [...selectedIds, id];
}

export function selectionAfterSingleReview(selectedIds: string[], reviewedId: string, pageOffset: number): string[] {
  if (pageOffset > 0) return [];
  return selectedIds.filter((id) => id !== reviewedId);
}

export function isReviewInteractionLocked(singleReviewPending: boolean, batchReviewPending: boolean, suggestionsFetching: boolean): boolean {
  return singleReviewPending || batchReviewPending || suggestionsFetching;
}
