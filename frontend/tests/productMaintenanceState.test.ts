import { accumulateCountryRun, isReviewInteractionLocked, loadCountryRunSession, nextSelectedIds, selectionAfterSingleReview } from '../src/pages/admin/productMaintenanceState';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('country maintenance run state', () => {
  test('resumes only the selected country from its last successful cursor', () => {
    const storage = new MemoryStorage();
    storage.setItem('product-maintenance-country-run:7', JSON.stringify({
      cursor: 'country-7-next', hasMore: true, scanned: 25, proposed: 4, warnings: ['translated'], previewCount: 4,
    }));

    expect(loadCountryRunSession(storage, '7')).toEqual({
      cursor: 'country-7-next', hasMore: true, scanned: 25, proposed: 4, warnings: ['translated'], previewCount: 4,
    });
    expect(loadCountryRunSession(storage, '8')).toBeNull();
  });

  test('ignores malformed or incomplete saved progress', () => {
    const storage = new MemoryStorage();
    storage.setItem('product-maintenance-country-run:7', '{bad json');
    expect(loadCountryRunSession(storage, '7')).toBeNull();

    storage.setItem('product-maintenance-country-run:7', JSON.stringify({ cursor: 4, hasMore: 'yes' }));
    expect(loadCountryRunSession(storage, '7')).toBeNull();
  });

  test('accumulates continuation totals and keeps warnings unique', () => {
    const previous = { cursor: 'page-2', hasMore: true, scanned: 25, proposed: 4, warnings: ['translated'], previewCount: 4 };
    expect(accumulateCountryRun(previous, {
      next_cursor: 'page-3', has_more: true, scanned: 20, proposed: 3,
      warnings: ['translated', 'one store unavailable'], previews: [{}, {}, {}],
    }, true)).toEqual({
      cursor: 'page-3', hasMore: true, scanned: 45, proposed: 7,
      warnings: ['translated', 'one store unavailable'], previewCount: 7,
    });
  });

  test('a new scan resets totals instead of accumulating a completed run', () => {
    const previous = { cursor: null, hasMore: false, scanned: 100, proposed: 12, warnings: ['old'], previewCount: 12 };
    expect(accumulateCountryRun(previous, {
      next_cursor: null, has_more: false, scanned: 6, proposed: 1, warnings: [], previews: [{}],
    }, false)).toEqual({ cursor: null, hasMore: false, scanned: 6, proposed: 1, warnings: [], previewCount: 1 });
  });
});

describe('batch review selection', () => {
  test('caps selection at fifty unique suggestions while allowing deselection', () => {
    let selected: string[] = [];
    for (let id = 1; id <= 51; id += 1) selected = nextSelectedIds(selected, String(id), true);

    expect(selected).toHaveLength(50);
    expect(selected).not.toContain('51');
    expect(nextSelectedIds(selected, '3', false)).not.toContain('3');
  });

  test('clears page selections when a single review returns to the first page', () => {
    expect(selectionAfterSingleReview(['11', '12'], '11', 100)).toEqual([]);
    expect(selectionAfterSingleReview(['11', '12'], '11', 0)).toEqual(['12']);
  });

  test('locks scope changes during either review mutation or suggestion loading', () => {
    expect(isReviewInteractionLocked(false, false, false)).toBe(false);
    expect(isReviewInteractionLocked(true, false, false)).toBe(true);
    expect(isReviewInteractionLocked(false, true, false)).toBe(true);
    expect(isReviewInteractionLocked(false, false, true)).toBe(true);
  });
});
