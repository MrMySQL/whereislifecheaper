import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, CheckCircle2, ExternalLink, ImageOff, PackageSearch, Play, RefreshCw, RotateCcw, X } from 'lucide-react';
import Loading from '../../components/common/Loading';
import { countriesApi } from '../../services/api';
import { maintenanceApi, maintenanceErrorMessage, type CoverageStatus, type MaintenanceId, type MaintenanceStatus, type MaintenanceSuggestion, type QuantityInfo } from '../../services/maintenanceApi';
import { formatDateTime, formatRelativeTime } from '../../utils/dateFormat';
import { accumulateCountryRun, COUNTRY_RUN_STORAGE_PREFIX, isReviewInteractionLocked, loadCountryRunSession, nextSelectedIds, selectionAfterSingleReview, type CountryRunSession } from './productMaintenanceState';

const statusStyles: Record<string, string> = {
  covered: 'bg-olive-100 text-olive-700', stale: 'bg-saffron-100 text-saffron-700', missing: 'bg-red-100 text-red-700',
  pending: 'bg-saffron-100 text-saffron-700', approved: 'bg-olive-100 text-olive-700', rejected: 'bg-red-100 text-red-700', undone: 'bg-slate-100 text-slate-700',
  available: 'bg-olive-100 text-olive-700', out_of_stock: 'bg-orange-100 text-orange-700', unknown: 'bg-slate-100 text-slate-700',
};

function label(value: string) { return value.replaceAll('_', ' '); }

function quantityText(quantity: QuantityInfo | string | null | undefined) {
  if (!quantity) return 'Not interpreted';
  if (typeof quantity === 'string') return quantity;
  if (quantity.normalized) return quantity.normalized;
  if (quantity.contentQuantity != null && quantity.contentUnit) return `${quantity.contentQuantity} ${quantity.contentUnit}`;
  return quantity.status ? label(quantity.status) : 'Not interpreted';
}

function SuggestionCard({ suggestion, busy, selected, selectionDisabled, batchError, onSelect, onAction }: {
  suggestion: MaintenanceSuggestion;
  busy: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  batchError?: string;
  onSelect: (id: MaintenanceId, selected: boolean) => void;
  onAction: (id: MaintenanceId, action: 'approve' | 'reject' | 'undo') => void;
}) {
  const payload = suggestion.payload || {};
  const quantity = typeof payload.quantity === 'object' ? payload.quantity : undefined;
  const evidence = [...new Set([...(payload.evidence || []), ...(payload.reasons || [])])];
  const price = payload.latest_price ?? payload.price;
  const availability = payload.availability_status;
  const rawQuantity = payload.raw_quantity ?? quantity?.raw ?? (typeof payload.quantity === 'string' ? payload.quantity : null);
  const rawListingQuantity = payload.raw?.unit
    ? `${payload.raw.unit_quantity ?? 1} ${payload.raw.unit}`
    : rawQuantity;
  const normalizedQuantity = payload.normalized_quantity ?? quantityText(payload.quantity);

  return (
    <article className="space-y-3 py-4 first:pt-2 last:pb-1">
      <div className="flex gap-3">
        {suggestion.status === 'pending' && <input
          type="checkbox"
          aria-label={`Select ${suggestion.product_name}`}
          checked={selected}
          disabled={busy || (selectionDisabled && !selected)}
          onChange={(event) => onSelect(suggestion.id, event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-cream-300 text-terracotta-600 disabled:opacity-50"
        />}
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-cream-200 bg-cream-50">
          {payload.image_url
            ? <img src={payload.image_url} alt={suggestion.product_name} className="h-full w-full object-contain" loading="lazy" />
            : <div className="flex h-full w-full items-center justify-center text-charcoal-300"><ImageOff className="h-6 w-6" aria-label="No product image" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`badge ${statusStyles[suggestion.status]}`}>{label(suggestion.status)}</span>
                {availability && <span className={`badge ${statusStyles[availability] || statusStyles.unknown}`}>{label(availability)}</span>}
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-charcoal-400">Local listing</p>
              <h3 className="font-semibold text-charcoal-900">{suggestion.product_name}</h3>
              {payload.translated_name && payload.translated_name !== suggestion.product_name && <p className="mt-0.5 text-sm text-charcoal-600"><span className="text-charcoal-400">Translated:</span> {payload.translated_name}</p>}
            </div>
            <div className="shrink-0 text-xs text-charcoal-500 sm:text-right">
              <p className="font-medium text-charcoal-700">{suggestion.supermarket_name}</p>
              {suggestion.country_name && <p>{suggestion.country_name}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-cream-50 px-3 py-2"><p className="text-xs text-charcoal-500">Latest price</p><p className="font-semibold text-charcoal-900">{price == null ? 'Unavailable' : `${price.toLocaleString()} ${payload.currency || ''}`}</p></div>
        <div className="rounded-lg bg-cream-50 px-3 py-2"><p className="text-xs text-charcoal-500">Last available</p><p className="font-medium text-charcoal-800">{payload.last_available_at ? formatRelativeTime(payload.last_available_at) : 'Unknown'}</p></div>
        <div className="rounded-lg bg-cream-50 px-3 py-2"><p className="text-xs text-charcoal-500">Local quantity</p><p className="font-medium text-charcoal-800">{rawListingQuantity || 'Not supplied'}</p></div>
        <div className="rounded-lg bg-cream-50 px-3 py-2"><p className="text-xs text-charcoal-500">Normalized</p><p className="font-medium text-charcoal-800">{normalizedQuantity}</p>{quantity?.priceBasis && <p className="text-xs text-charcoal-500">Basis: {label(quantity.priceBasis)}</p>}</div>
      </div>

      {evidence.length > 0 && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Why it matched</p><ul className="space-y-1 text-sm text-charcoal-700">{evidence.slice(0, 3).map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-olive-600" /><span>{item}</span></li>)}</ul></div>}
      {payload.search_terms && payload.search_terms.length > 0 && <p className="text-xs text-charcoal-500">Search terms: {payload.search_terms.join(', ')}</p>}
      {batchError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Batch action failed: {batchError}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-2">
        <div className="text-xs text-charcoal-500">Suggested {formatDateTime(suggestion.created_at)}{suggestion.reviewed_at ? ` · reviewed ${formatRelativeTime(suggestion.reviewed_at)}` : ''}</div>
        <div className="flex items-center gap-2">
          {payload.url && <a href={payload.url} target="_blank" rel="noreferrer" className="btn-ghost !px-3 !py-2 text-sm"><ExternalLink className="h-4 w-4" />Source</a>}
          {suggestion.status === 'pending' ? <>
            <button disabled={busy} onClick={() => onAction(suggestion.id, 'reject')} className="btn-secondary !px-3 !py-2 text-sm disabled:opacity-50"><X className="h-4 w-4" />Reject</button>
            <button disabled={busy} onClick={() => onAction(suggestion.id, 'approve')} className="btn-olive !px-3 !py-2 text-sm disabled:opacity-50"><Check className="h-4 w-4" />Approve</button>
          </> : suggestion.status === 'approved' ? <button disabled={busy} onClick={() => onAction(suggestion.id, 'undo')} className="btn-secondary !px-3 !py-2 text-sm disabled:opacity-50"><RotateCcw className="h-4 w-4" />Undo approval</button> : null}
        </div>
      </div>
    </article>
  );
}

const PAGE_SIZE = 100;

function Pagination({ label, offset, count, total, busy, onChange }: { label: string; offset: number; count: number; total: number; busy: boolean; onChange: (offset: number) => void }) {
  return <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-charcoal-500">
    <span>Showing {count ? offset + 1 : 0}–{count ? offset + count : 0} of {total}</span>
    <div className="flex gap-2">
      <button aria-label={`Previous ${label} page`} disabled={busy || offset === 0} className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50" onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
      <button aria-label={`Next ${label} page`} disabled={busy || offset + PAGE_SIZE >= total} className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50" onClick={() => onChange(offset + PAGE_SIZE)}>Next</button>
    </div>
  </nav>;
}

export default function ProductMaintenance() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MaintenanceStatus>('pending');
  const [countryId, setCountryId] = useState('');
  const [runCountryId, setRunCountryId] = useState('');
  const [runSession, setRunSession] = useState<CountryRunSession | null>(null);
  const [runNotice, setRunNotice] = useState('');
  const [runLimit, setRunLimit] = useState(25);
  const [actionError, setActionError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchErrors, setBatchErrors] = useState<Record<string, string>>({});
  const [batchNotice, setBatchNotice] = useState('');
  const [showCovered, setShowCovered] = useState(false);
  const [coverageOffset, setCoverageOffset] = useState(0);
  const [suggestionsOffset, setSuggestionsOffset] = useState(0);
  const clearBatchSelection = () => {
    setSelectedIds([]);
    setBatchErrors({});
    setBatchNotice('');
  };
  const overview = useQuery({ queryKey: ['maintenance-overview', countryId, showCovered, coverageOffset], queryFn: () => maintenanceApi.getOverview({ country_id: countryId || undefined, gaps_only: !showCovered, limit: PAGE_SIZE, offset: coverageOffset }), refetchInterval: 10000 });
  const suggestions = useQuery({ queryKey: ['maintenance-suggestions', status, countryId, suggestionsOffset], queryFn: () => maintenanceApi.getSuggestions({ status, country_id: countryId || undefined, limit: PAGE_SIZE, offset: suggestionsOffset }) });
  const countries = useQuery({ queryKey: ['countries'], queryFn: countriesApi.getAll });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['maintenance-overview'] }); queryClient.invalidateQueries({ queryKey: ['maintenance-suggestions'] }); };
  const runMutation = useMutation({
    mutationKey: ['maintenance-run'],
    mutationFn: ({ selectedCountryId, previous }: { selectedCountryId: string; previous: CountryRunSession | null }) => maintenanceApi.run({
      limit: runLimit,
      dry_run: false,
      ...(selectedCountryId ? { country_id: selectedCountryId } : {}),
      ...(selectedCountryId && previous?.hasMore && previous.cursor ? { cursor: previous.cursor } : {}),
    }),
    onSuccess: (data, variables) => {
      const continuing = Boolean(variables.selectedCountryId && variables.previous?.hasMore && variables.previous.cursor);
      const nextSession = accumulateCountryRun(variables.previous, data, continuing);
      if (variables.selectedCountryId) {
        try { sessionStorage.setItem(`${COUNTRY_RUN_STORAGE_PREFIX}${variables.selectedCountryId}`, JSON.stringify(nextSession)); } catch { /* Progress remains visible for this page load. */ }
        setRunSession(nextSession);
      } else {
        setRunSession(null);
        setRunNotice(`Scanned ${data.scanned} combinations; proposed ${data.proposed} mappings.${data.warnings.length ? ` ${data.warnings.join(' ')}` : ''}`);
      }
      setSuggestionsOffset(0);
      clearBatchSelection();
      invalidate();
    },
    onError: (error) => setActionError(maintenanceErrorMessage(error, 'The scan failed. Retry to continue.')),
  });
  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: MaintenanceId; action: 'approve' | 'reject' | 'undo' }) => maintenanceApi.review(id, action),
    onSuccess: (_data, variables) => {
      const reviewedId = String(variables.id);
      setSelectedIds((ids) => selectionAfterSingleReview(ids, reviewedId, suggestionsOffset));
      if (suggestionsOffset > 0) {
        setBatchErrors({});
        setBatchNotice('');
      } else {
        setBatchErrors((errors) => { const next = { ...errors }; delete next[reviewedId]; return next; });
      }
      setSuggestionsOffset(0);
      invalidate();
    },
    onError: (error) => setActionError(maintenanceErrorMessage(error, 'The review action failed. Refresh and try again.')),
  });
  const batchMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'approve' | 'reject' }) => maintenanceApi.batchReview(ids, action),
    onSuccess: (data, variables) => {
      const results = new Map(data.results.map((result) => [String(result.id), result]));
      const errors: Record<string, string> = {};
      for (const id of variables.ids) {
        const result = results.get(id);
        if (!result?.status) errors[id] = result?.error || 'No result was returned for this suggestion.';
      }
      const failedIds = new Set(Object.keys(errors));
      const succeeded = variables.ids.length - failedIds.size;
      setBatchErrors(errors);
      setSelectedIds(variables.ids.filter((id) => failedIds.has(id)));
      setBatchNotice(failedIds.size
        ? `${succeeded} updated; ${failedIds.size} failed and remain selected.`
        : `${succeeded} suggestion${succeeded === 1 ? '' : 's'} ${variables.action === 'approve' ? 'approved' : 'rejected'}.`);
      invalidate();
    },
    onError: (error) => setActionError(maintenanceErrorMessage(error, 'The batch review failed. Your selection was kept.')),
  });

  const coverageCounts = overview.data?.counts || { covered: 0, stale: 0, missing: 0 };
  const filteredCoverage = overview.data?.coverage || [];
  const error = overview.error || suggestions.error;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const groupedSuggestions = useMemo(() => {
    const groups = new Map<string, MaintenanceSuggestion[]>();
    for (const suggestion of suggestions.data?.data || []) {
      const key = String(suggestion.canonical_product_id);
      groups.set(key, [...(groups.get(key) || []), suggestion]);
    }
    return [...groups.values()];
  }, [suggestions.data?.data]);
  const selectableIds = useMemo(() => (suggestions.data?.data || []).reduce<string[]>((ids, suggestion) => {
    if (suggestion.status === 'pending') ids.push(String(suggestion.id));
    return ids;
  }, []), [suggestions.data?.data]);
  const allSelectableSelected = selectableIds.length > 0 && selectableIds.slice(0, 50).every((id) => selectedSet.has(id));
  const selectedRunCountry = countries.data?.find((country) => String(country.id) === runCountryId);
  const reviewControlsLocked = isReviewInteractionLocked(reviewMutation.isPending, batchMutation.isPending, suggestions.isFetching) || runMutation.isPending;

  const startCountryRun = () => {
    if (reviewControlsLocked) return;
    setRunNotice('');
    setActionError('');
    runMutation.mutate({ selectedCountryId: runCountryId, previous: runSession });
  };

  const resetCountryRun = () => {
    if (!runCountryId) return;
    try { sessionStorage.removeItem(`${COUNTRY_RUN_STORAGE_PREFIX}${runCountryId}`); } catch { /* Progress is still reset in memory. */ }
    setRunSession(null);
    setActionError('');
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><h1 className="text-2xl font-bold text-charcoal-900">Product maintenance</h1><p className="text-charcoal-600 mt-1">Find coverage gaps and review replacement mappings with their source evidence.</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-charcoal-600">Country to map<select aria-label="Country to map" value={runCountryId} disabled={reviewControlsLocked} onChange={(event) => { const nextCountryId = event.target.value; setRunCountryId(nextCountryId); setRunNotice(''); setRunSession(nextCountryId ? loadCountryRunSession(sessionStorage, nextCountryId) : null); setActionError(''); }} className="input mt-1 !w-auto min-w-48 !px-3 !py-2"><option value="">All countries</option>{countries.data?.map((country) => <option value={country.id} key={country.id}>{country.flag_emoji} {country.name}</option>)}</select></label>
        <label className="text-sm text-charcoal-600">Batch size<input aria-label="Scan limit" type="number" min={1} max={25} value={runLimit} disabled={reviewControlsLocked} onChange={(e) => setRunLimit(Math.min(25, Math.max(1, Number(e.target.value) || 1)))} className="input mt-1 !w-20 !px-3 !py-2" /></label>
        <button className="btn-primary !py-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={reviewControlsLocked} onClick={startCountryRun}>{runMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{runMutation.isPending ? 'Scanning…' : !runCountryId ? 'Run maintenance' : runSession?.hasMore ? 'Resume mapping' : 'Map this country'}</button>
      </div>
    </div>

    {runNotice && <p role="status" className="text-sm text-charcoal-600">{runNotice}</p>}

    {selectedRunCountry && runSession && <section className="card !p-4" aria-label="Country mapping progress">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-charcoal-900">{selectedRunCountry.flag_emoji} {selectedRunCountry.name} mapping run</h2><span className={`badge ${runSession.hasMore ? statusStyles.pending : statusStyles.approved}`}>{runSession.hasMore ? 'Ready to resume' : 'Complete'}</span></div>
          <p className="mt-1 text-sm text-charcoal-500">Progress is saved in this browser tab after every successful batch.</p>
        </div>
        <button className="btn-ghost !px-3 !py-2 text-sm" disabled={runMutation.isPending} onClick={resetCountryRun}>Start over</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl bg-cream-50 p-3"><p className="text-xs text-charcoal-500">Scanned</p><p className="text-2xl font-bold tabular-nums text-charcoal-900">{runSession.scanned}</p></div>
        <div className="rounded-xl bg-cream-50 p-3"><p className="text-xs text-charcoal-500">Proposed</p><p className="text-2xl font-bold tabular-nums text-charcoal-900">{runSession.proposed}</p></div>
      </div>
      {runSession.warnings.length > 0 && <div className="mt-3 rounded-lg border border-saffron-200 bg-saffron-50 px-3 py-2 text-sm text-charcoal-700"><p className="font-medium">Run warnings</p><ul className="mt-1 list-disc pl-5">{runSession.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
    </section>}

    {(error || actionError) && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex gap-2"><AlertCircle className="h-5 w-5 shrink-0" /><span>{actionError || 'Maintenance data could not be loaded.'}</span><button className="ml-auto underline" onClick={() => { setActionError(''); overview.refetch(); suggestions.refetch(); }}>Retry</button></div>}

    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Coverage summary">
      {(['covered', 'stale', 'missing'] as CoverageStatus[]).map((item) => <div className="card !p-4" key={item}><div className="flex items-center justify-between"><p className="text-sm capitalize text-charcoal-600">{item}</p><span className={`badge ${statusStyles[item]}`}>{item === 'missing' ? 'No mapping' : item}</span></div><p className="text-3xl font-bold text-charcoal-900 mt-2">{overview.isLoading ? '—' : coverageCounts[item]}</p><p className="text-xs text-charcoal-500 mt-1">canonical × country × store combinations</p></div>)}
    </section>

    <section className="card !p-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
        <div><h2 className="font-semibold text-charcoal-900">Coverage details</h2><p className="text-sm text-charcoal-500">Missing and stale combinations are shown first, including gaps without candidates.</p></div>
        <label className="flex items-center gap-2 text-sm text-charcoal-600"><input type="checkbox" checked={showCovered} onChange={(event) => { setShowCovered(event.target.checked); setCoverageOffset(0); }} className="h-4 w-4 rounded border-cream-300 text-terracotta-600" />Show covered</label>
      </div>
      {overview.isLoading ? <Loading text="Loading coverage…" /> : filteredCoverage.length === 0 ? <p className="text-sm text-charcoal-500 py-6 text-center">No coverage rows match these filters.</p> : <>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-cream-200 text-left text-charcoal-500"><th className="py-2 pr-3">Canonical</th><th className="pr-3">Country</th><th className="pr-3">Store</th><th className="pr-3">Mapped</th><th className="pr-3">Current</th><th>Status</th></tr></thead><tbody>{filteredCoverage.map((row) => <tr className="table-row" key={`${row.canonical_product_id}-${row.country_id}-${row.supermarket_id}`}><td className="py-2 pr-3 font-medium text-charcoal-800">{row.name}</td><td className="pr-3">{row.country_name}</td><td className="pr-3">{row.supermarket_name}</td><td className="pr-3 tabular-nums">{row.mapped_count}</td><td className="pr-3 tabular-nums">{row.fresh_count}</td><td><span className={`badge ${statusStyles[row.status]}`}>{row.status === 'missing' ? 'no mapping' : row.status}</span></td></tr>)}</tbody></table></div>

      </>}
      {!!overview.data?.total && <Pagination label="coverage" offset={coverageOffset} count={filteredCoverage.length} total={overview.data.total} busy={overview.isFetching} onChange={setCoverageOffset} />}
    </section>

    <section className="card !p-5">
      <div className="flex items-center justify-between gap-3 mb-3"><div><h2 className="font-semibold text-charcoal-900">Recent runs</h2><p className="text-sm text-charcoal-500">Bounded maintenance scan history</p></div><button className="btn-ghost !p-2" aria-label="Refresh maintenance data" onClick={() => { overview.refetch(); suggestions.refetch(); }}><RefreshCw className="h-4 w-4" /></button></div>
      {overview.isLoading ? <Loading text="Loading maintenance status…" /> : !overview.data?.runs.length ? <p className="text-sm text-charcoal-500 py-3">No maintenance runs yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-cream-200 text-left text-charcoal-500"><th className="py-2">Status</th><th>Started</th><th>Scanned</th><th>Proposed</th><th>Mode</th></tr></thead><tbody>{overview.data.runs.slice(0, 8).map((run) => <tr className="table-row" key={run.id}><td className="py-2"><span className={`badge ${run.status === 'failed' ? statusStyles.rejected : run.status === 'completed' ? statusStyles.approved : statusStyles.pending}`}>{run.status}</span>{run.error && <p className="text-xs text-red-600 mt-1">{run.error}</p>}</td><td>{formatDateTime(run.started_at)}</td><td>{run.scanned}</td><td>{run.proposed}</td><td>{run.dry_run ? 'Dry run' : 'Saved'}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3"><div><h2 className="text-lg font-semibold text-charcoal-900">Candidate review</h2><p className="text-sm text-charcoal-500">Every approval is explicit and audited. Approved mappings can be undone.</p></div><div className="flex gap-2"><select disabled={reviewControlsLocked} className="input !py-2 !w-auto disabled:opacity-50" aria-label="Suggestion status" value={status} onChange={(e) => { setStatus(e.target.value as MaintenanceStatus); setSuggestionsOffset(0); clearBatchSelection(); }}>{(['pending', 'approved', 'rejected', 'undone'] as const).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><select disabled={reviewControlsLocked} className="input !py-2 !w-auto max-w-48 disabled:opacity-50" aria-label="Country" value={countryId} onChange={(e) => { setCountryId(e.target.value); setCoverageOffset(0); setSuggestionsOffset(0); clearBatchSelection(); }}><option value="">All countries</option>{countries.data?.map((country) => <option value={country.id} key={country.id}>{country.flag_emoji} {country.name}</option>)}</select></div></div>
      {status === 'pending' && selectableIds.length > 0 && <div className="card !p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-charcoal-700"><input type="checkbox" checked={allSelectableSelected} disabled={reviewControlsLocked} onChange={(event) => { setBatchErrors({}); setBatchNotice(''); setSelectedIds(event.target.checked ? selectableIds.slice(0, 50) : []); }} className="h-4 w-4 rounded border-cream-300 text-terracotta-600" />Select up to 50 on this page</label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium text-charcoal-700">{selectedIds.length} selected</span>
            <button disabled={!selectedIds.length || reviewControlsLocked} onClick={() => { setActionError(''); setBatchErrors({}); setBatchNotice(''); batchMutation.mutate({ ids: selectedIds, action: 'reject' }); }} className="btn-secondary !px-3 !py-2 text-sm disabled:opacity-50"><X className="h-4 w-4" />Reject selected</button>
            <button disabled={!selectedIds.length || reviewControlsLocked} onClick={() => { setActionError(''); setBatchErrors({}); setBatchNotice(''); batchMutation.mutate({ ids: selectedIds, action: 'approve' }); }} className="btn-olive !px-3 !py-2 text-sm disabled:opacity-50">{batchMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve selected</button>
          </div>
        </div>
        {selectedIds.length === 50 && selectableIds.length > 50 && <p className="mt-2 text-xs text-charcoal-500">The API accepts 50 items per batch. Review this batch before selecting more.</p>}
        {batchNotice && <div role="status" className={`mt-3 rounded-lg border px-3 py-2 text-sm ${Object.keys(batchErrors).length ? 'border-saffron-200 bg-saffron-50 text-charcoal-700' : 'border-olive-200 bg-olive-50 text-olive-800'}`}>{batchNotice}</div>}
      </div>}
      {suggestions.isLoading ? <div className="card"><Loading text="Loading suggestions…" /></div> : !suggestions.data?.data.length ? <div className="card text-center py-12"><PackageSearch className="h-10 w-10 text-charcoal-300 mx-auto mb-3" /><p className="font-medium text-charcoal-700">No {status} suggestions</p><p className="text-sm text-charcoal-500 mt-1">Run maintenance or choose another filter.</p></div> : <div className="space-y-4">{groupedSuggestions.map((group) => {
        const first = group[0];
        if (!first) return null;
        return <section className="card !p-4" key={String(first.canonical_product_id)} aria-labelledby={`canonical-${first.canonical_product_id}`}>
          <div className="flex items-center justify-between gap-3 border-b border-cream-200 pb-3"><div><p className="text-xs font-medium uppercase tracking-wide text-charcoal-400">Canonical product</p><h3 id={`canonical-${first.canonical_product_id}`} className="font-semibold text-charcoal-900">{first.canonical_name}</h3></div><span className="badge bg-cream-100 text-charcoal-600">{group.length} candidate{group.length === 1 ? '' : 's'}</span></div>
          <div className="divide-y divide-cream-200">{group.map((suggestion) => {
            const suggestionId = String(suggestion.id);
            return <SuggestionCard
              key={suggestionId}
              suggestion={suggestion}
              busy={reviewControlsLocked}
              selected={selectedSet.has(suggestionId)}
              selectionDisabled={selectedIds.length >= 50}
              batchError={batchErrors[suggestionId]}
              onSelect={(id, isSelected) => { setBatchErrors((errors) => { const next = { ...errors }; delete next[String(id)]; return next; }); setBatchNotice(''); setSelectedIds((ids) => nextSelectedIds(ids, String(id), isSelected)); }}
              onAction={(id, action) => { setActionError(''); setBatchNotice(''); reviewMutation.mutate({ id, action }); }}
            />;
          })}</div>
        </section>;
      })}</div>}
      {!!suggestions.data?.total && <Pagination label="suggestions" offset={suggestionsOffset} count={suggestions.data.data.length} total={suggestions.data.total} busy={reviewControlsLocked} onChange={(offset) => { clearBatchSelection(); setSuggestionsOffset(offset); }} />}
    </section>
  </div>;
}
