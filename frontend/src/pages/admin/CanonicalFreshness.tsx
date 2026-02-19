import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { canonicalApi } from '../../services/api';
import type { CanonicalMappedProduct } from '../../types';
import Loading from '../../components/common/Loading';
import { formatDateTime, formatRelativeTime } from '../../utils/dateFormat';

const ROWS_PER_PAGE = 50;
const DEFAULT_STALE_DAYS = 7;

function formatUnit(unit: string | null, unitQuantity: number | null): string | null {
  if (!unit) return null;
  if (unitQuantity == null || Number(unitQuantity) === 1) return unit;
  return `${unitQuantity} ${unit}`;
}

export default function CanonicalFreshness() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [staleOnly, setStaleOnly] = useState(false);

  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam - 1 : 0;

  const setPageInUrl = (nextPage: number) => {
    const safePage = Math.max(0, nextPage);
    const nextParams = new URLSearchParams(searchParams);

    if (safePage === 0) {
      nextParams.delete('page');
    } else {
      nextParams.set('page', String(safePage + 1));
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextSearch = searchInput.trim();
      setSearch((prev) => (prev === nextSearch ? prev : nextSearch));
      setPageInUrl(0);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useQuery({
    queryKey: ['canonical-freshness', search, staleOnly, page],
    queryFn: () =>
      canonicalApi.getMappedProducts({
        search: search || undefined,
        stale_only: staleOnly || undefined,
        stale_days: DEFAULT_STALE_DAYS,
        limit: ROWS_PER_PAGE,
        offset: page * ROWS_PER_PAGE,
      }),
  });

  const rows = data?.data || [];
  const total = data?.count || 0;
  const staleThreshold = data?.meta?.stale_days_threshold || DEFAULT_STALE_DAYS;

  useEffect(() => {
    if (total <= 0) return;

    const maxPage = Math.max(Math.ceil(total / ROWS_PER_PAGE) - 1, 0);
    if (page > maxPage) {
      setPageInUrl(maxPage);
    }
  }, [total, page]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('canonicalFreshness.title')}</h1>
        <p className="text-slate-600 mt-1">{t('canonicalFreshness.description')}</p>
      </div>

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('canonicalFreshness.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input pl-10"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={staleOnly}
              onChange={(e) => {
                setStaleOnly(e.target.checked);
                setPageInUrl(0);
              }}
              className="w-4 h-4 text-amber-600 bg-slate-100 border-slate-300 rounded focus:ring-amber-500 focus:ring-2"
            />
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-slate-700">{t('canonicalFreshness.staleOnly')}</span>
          </label>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          {t('canonicalFreshness.staleThreshold', { days: staleThreshold })}
        </p>

        <div className="overflow-x-auto">
          {isLoading ? (
            <Loading text={t('canonicalFreshness.loading')} />
          ) : rows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">{t('canonicalFreshness.noResults')}</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">{t('canonicalFreshness.product')}</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">{t('canonicalFreshness.canonical')}</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">{t('canonicalFreshness.markets')}</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">{t('canonicalFreshness.lastScan')}</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">{t('canonicalFreshness.age')}</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">{t('canonicalFreshness.coverage')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: CanonicalMappedProduct) => {
                  const isNeverScanned = row.last_price_updated_at == null;
                  const isStale = !isNeverScanned && (row.stale_days ?? 0) >= staleThreshold;
                  const rowClass = isNeverScanned
                    ? 'bg-red-50/70 hover:bg-red-50'
                    : isStale
                      ? 'bg-amber-50/70 hover:bg-amber-50'
                      : 'hover:bg-slate-50';
                  const unitDisplay = formatUnit(row.unit, row.unit_quantity);

                  return (
                    <tr key={row.product_id} className={`border-b border-slate-100 ${rowClass}`}>
                      <td className="py-2 px-2">
                        <p className="font-medium text-slate-900 text-sm">{row.product_name}</p>
                        <p className="text-xs text-slate-500">
                          {row.brand || t('mapping.noBrand')}
                          {unitDisplay ? ` • ${unitDisplay}` : ''}
                        </p>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-800">{row.canonical_product_name}</span>
                          {row.canonical_disabled && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                              {t('canonicalFreshness.disabled')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        {row.markets?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {row.markets.slice(0, 4).map((market) => (
                              <span
                                key={market.supermarket_id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700"
                              >
                                <span>{market.country_flag || '🏳️'}</span>
                                <span>{market.supermarket_name}</span>
                              </span>
                            ))}
                            {row.markets.length > 4 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                +{row.markets.length - 4}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {isNeverScanned ? (
                          <span className="text-sm font-medium text-red-700">{t('canonicalFreshness.neverScanned')}</span>
                        ) : (
                          <span className="text-sm text-slate-700">{formatDateTime(row.last_price_updated_at)}</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {isNeverScanned ? (
                          <span className="text-sm font-medium text-red-700">{t('canonicalFreshness.neverScanned')}</span>
                        ) : (
                          <div>
                            <p className={`text-sm ${isStale ? 'text-amber-700 font-medium' : 'text-slate-700'}`}>
                              {formatRelativeTime(row.last_price_updated_at)}
                            </p>
                            <p className="text-xs text-slate-500">{t('canonicalFreshness.daysOld', { count: row.stale_days ?? 0 })}</p>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <p className="text-sm text-slate-700">{t('canonicalFreshness.mappingsCount', { count: row.mappings_count })}</p>
                        <p className="text-xs text-slate-500">{t('canonicalFreshness.countriesCount', { count: row.countries_count })}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {total > ROWS_PER_PAGE && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
            <p className="text-sm text-slate-500">
              {t('common.showing')} {page * ROWS_PER_PAGE + 1}-
              {Math.min((page + 1) * ROWS_PER_PAGE, total)} {t('common.of')} {total} {t('common.items')}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPageInUrl(Math.max(0, page - 1))}
                disabled={page === 0}
                className="btn-secondary py-1 px-2 disabled:opacity-50"
                aria-label={t('common.goToPreviousPage')}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-slate-600">
                {t('common.page')} {page + 1} {t('common.of')} {Math.ceil(total / ROWS_PER_PAGE)}
              </span>
              <button
                onClick={() => setPageInUrl(Math.min(Math.ceil(total / ROWS_PER_PAGE) - 1, page + 1))}
                disabled={(page + 1) * ROWS_PER_PAGE >= total}
                className="btn-secondary py-1 px-2 disabled:opacity-50"
                aria-label={t('common.goToNextPage')}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
