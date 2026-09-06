import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, CheckCircle2, ExternalLink, PackageSearch, Play, RefreshCw, RotateCcw, X } from 'lucide-react';
import Loading from '../../components/common/Loading';
import { countriesApi } from '../../services/api';
import { maintenanceApi, maintenanceErrorMessage, type CoverageStatus, type MaintenanceId, type MaintenanceStatus, type MaintenanceSuggestion, type QuantityInfo } from '../../services/maintenanceApi';
import { formatDateTime, formatRelativeTime } from '../../utils/dateFormat';

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

function SuggestionCard({ suggestion, busy, onAction }: { suggestion: MaintenanceSuggestion; busy: boolean; onAction: (id: MaintenanceId, action: 'approve' | 'reject' | 'undo') => void }) {
  const payload = suggestion.payload || {};
  const quantity = typeof payload.quantity === 'object' ? payload.quantity : undefined;
  const evidence = [...(payload.evidence || []), ...(payload.reasons || [])];
  const price = payload.latest_price ?? payload.price;
  const availability = payload.availability_status;
  const rawQuantity = payload.raw_quantity ?? quantity?.raw ?? (typeof payload.quantity === 'string' ? payload.quantity : null);
  const rawListingQuantity = payload.raw?.unit
    ? `${payload.raw.unit_quantity ?? 1} ${payload.raw.unit}`
    : rawQuantity;
  const normalizedQuantity = payload.normalized_quantity ?? quantityText(payload.quantity);

  return (
    <article className="card !p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`badge ${statusStyles[suggestion.status]}`}>{label(suggestion.status)}</span>
            {availability && <span className={`badge ${statusStyles[availability] || statusStyles.unknown}`}>{label(availability)}</span>}
          </div>
          <h3 className="font-semibold text-charcoal-900">{suggestion.product_name}</h3>
          <p className="text-sm text-charcoal-500">Proposed for <span className="font-medium text-charcoal-700">{suggestion.canonical_name}</span></p>
        </div>
        <div className="sm:text-right text-sm">
          <p className="font-medium text-charcoal-700">{suggestion.supermarket_name}</p>
          {suggestion.country_name && <p className="text-charcoal-500">{suggestion.country_name}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <div className="rounded-xl bg-cream-50 p-3"><p className="text-xs text-charcoal-500">Latest price</p><p className="font-semibold text-charcoal-900">{price == null ? 'Unavailable' : `${price.toLocaleString()} ${payload.currency || ''}`}</p></div>
        <div className="rounded-xl bg-cream-50 p-3"><p className="text-xs text-charcoal-500">Last available</p><p className="font-medium text-charcoal-800">{payload.last_available_at ? formatRelativeTime(payload.last_available_at) : 'Unknown'}</p></div>
        <div className="rounded-xl bg-cream-50 p-3"><p className="text-xs text-charcoal-500">Raw quantity</p><p className="font-medium text-charcoal-800">{rawListingQuantity || 'Not supplied'}</p>{payload.raw?.name && <p className="text-xs text-charcoal-500 mt-1 line-clamp-2">{payload.raw.name}</p>}</div>
        <div className="rounded-xl bg-cream-50 p-3"><p className="text-xs text-charcoal-500">Normalized</p><p className="font-medium text-charcoal-800">{normalizedQuantity}</p>{quantity?.priceBasis && <p className="text-xs text-charcoal-500 mt-1">Price basis: {label(quantity.priceBasis)}</p>}{quantity?.comparablePrice != null && <p className="text-xs text-charcoal-500">Comparable: {quantity.comparablePrice.toLocaleString()} {payload.currency || ''}/{quantity.contentUnit || 'unit'}</p>}</div>
      </div>

      {evidence.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-charcoal-500 mb-1">Evidence</p><ul className="space-y-1 text-sm text-charcoal-700">{evidence.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-olive-600" /><span>{item}</span></li>)}</ul></div>}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-cream-200">
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
  const [runLimit, setRunLimit] = useState(25);
  const [actionError, setActionError] = useState('');
  const [showCovered, setShowCovered] = useState(false);
  const [coverageOffset, setCoverageOffset] = useState(0);
  const [suggestionsOffset, setSuggestionsOffset] = useState(0);
  const overview = useQuery({ queryKey: ['maintenance-overview', countryId, showCovered, coverageOffset], queryFn: () => maintenanceApi.getOverview({ country_id: countryId || undefined, gaps_only: !showCovered, limit: PAGE_SIZE, offset: coverageOffset }), refetchInterval: 10000 });
  const suggestions = useQuery({ queryKey: ['maintenance-suggestions', status, countryId, suggestionsOffset], queryFn: () => maintenanceApi.getSuggestions({ status, country_id: countryId || undefined, limit: PAGE_SIZE, offset: suggestionsOffset }) });
  const countries = useQuery({ queryKey: ['countries'], queryFn: countriesApi.getAll });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['maintenance-overview'] }); queryClient.invalidateQueries({ queryKey: ['maintenance-suggestions'] }); };
  const runMutation = useMutation({ mutationFn: () => maintenanceApi.run({ limit: runLimit, dry_run: false }), onSuccess: invalidate, onError: (error) => setActionError(maintenanceErrorMessage(error, 'Could not start maintenance. Please try again.')) });
  const reviewMutation = useMutation({ mutationFn: ({ id, action }: { id: MaintenanceId; action: 'approve' | 'reject' | 'undo' }) => maintenanceApi.review(id, action), onSuccess: () => { setSuggestionsOffset(0); invalidate(); }, onError: (error) => setActionError(maintenanceErrorMessage(error, 'The review action failed. Refresh and try again.')) });
  const coverageCounts = overview.data?.counts || { covered: 0, stale: 0, missing: 0 };
  const filteredCoverage = overview.data?.coverage || [];
  const error = overview.error || suggestions.error;

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-charcoal-900">Product maintenance</h1><p className="text-charcoal-600 mt-1">Find coverage gaps and review replacement mappings with their source evidence.</p></div>
      <div className="flex items-center gap-2"><label className="text-sm text-charcoal-600">Scan limit <input aria-label="Scan limit" type="number" min={1} max={25} value={runLimit} onChange={(e) => setRunLimit(Math.min(25, Math.max(1, Number(e.target.value) || 1)))} className="input !w-20 !px-3 !py-2 ml-2" /></label><button className="btn-primary !py-2" disabled={runMutation.isPending} onClick={() => { setActionError(''); runMutation.mutate(); }}>{runMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{runMutation.isPending ? 'Starting…' : 'Run maintenance'}</button></div>
    </div>

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
      {overview.data && <Pagination label="coverage" offset={coverageOffset} count={filteredCoverage.length} total={overview.data.total} busy={overview.isFetching} onChange={setCoverageOffset} />}
    </section>

    <section className="card !p-5">
      <div className="flex items-center justify-between gap-3 mb-3"><div><h2 className="font-semibold text-charcoal-900">Recent runs</h2><p className="text-sm text-charcoal-500">Bounded maintenance scan history</p></div><button className="btn-ghost !p-2" aria-label="Refresh maintenance data" onClick={() => { overview.refetch(); suggestions.refetch(); }}><RefreshCw className="h-4 w-4" /></button></div>
      {overview.isLoading ? <Loading text="Loading maintenance status…" /> : !overview.data?.runs.length ? <p className="text-sm text-charcoal-500 py-3">No maintenance runs yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-cream-200 text-left text-charcoal-500"><th className="py-2">Status</th><th>Started</th><th>Scanned</th><th>Proposed</th><th>Mode</th></tr></thead><tbody>{overview.data.runs.slice(0, 8).map((run) => <tr className="table-row" key={run.id}><td className="py-2"><span className={`badge ${run.status === 'failed' ? statusStyles.rejected : run.status === 'completed' ? statusStyles.approved : statusStyles.pending}`}>{run.status}</span>{run.error && <p className="text-xs text-red-600 mt-1">{run.error}</p>}</td><td>{formatDateTime(run.started_at)}</td><td>{run.scanned}</td><td>{run.proposed}</td><td>{run.dry_run ? 'Dry run' : 'Saved'}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3"><div><h2 className="text-lg font-semibold text-charcoal-900">Candidate review</h2><p className="text-sm text-charcoal-500">Every approval is explicit and audited. Approved mappings can be undone.</p></div><div className="flex gap-2"><select className="input !py-2 !w-auto" aria-label="Suggestion status" value={status} onChange={(e) => { setStatus(e.target.value as MaintenanceStatus); setSuggestionsOffset(0); }}>{(['pending', 'approved', 'rejected', 'undone'] as const).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><select className="input !py-2 !w-auto max-w-48" aria-label="Country" value={countryId} onChange={(e) => { setCountryId(e.target.value); setCoverageOffset(0); setSuggestionsOffset(0); }}><option value="">All countries</option>{countries.data?.map((country) => <option value={country.id} key={country.id}>{country.flag_emoji} {country.name}</option>)}</select></div></div>
      {suggestions.isLoading ? <div className="card"><Loading text="Loading suggestions…" /></div> : !suggestions.data?.data.length ? <div className="card text-center py-12"><PackageSearch className="h-10 w-10 text-charcoal-300 mx-auto mb-3" /><p className="font-medium text-charcoal-700">No {status} suggestions</p><p className="text-sm text-charcoal-500 mt-1">Run maintenance or choose another filter.</p></div> : <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{suggestions.data.data.map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} busy={reviewMutation.isPending && reviewMutation.variables?.id === suggestion.id} onAction={(id, action) => { setActionError(''); reviewMutation.mutate({ id, action }); }} />)}</div>}
      {suggestions.data && <Pagination label="suggestions" offset={suggestionsOffset} count={suggestions.data.data.length} total={suggestions.data.total} busy={suggestions.isFetching} onChange={setSuggestionsOffset} />}
    </section>
  </div>;
}
