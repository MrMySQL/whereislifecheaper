import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { scraperApi, countriesApi } from '../../services/api';
import Loading from '../../components/common/Loading';

interface ScrapeLog {
  id: number;
  supermarket_id: number;
  supermarket_name: string;
  country_name: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'failed';
  products_scraped: number | null;
  products_failed: number | null;
  error_message: string | null;
  duration_seconds: number | null;
}

interface Supermarket {
  id: number;
  name: string;
  country_id: number;
  is_active: boolean;
}

interface Country {
  id: number;
  name: string;
  code: string;
  flag_emoji: string;
  supermarkets?: Supermarket[];
}

export default function Scrapers() {
  const queryClient = useQueryClient();

  // Fetch scraper status
  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['scraperStatus'],
    queryFn: scraperApi.getStatus,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  // Fetch countries with supermarkets
  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: countriesApi.getAll,
  });

  // Trigger scraper mutation
  const triggerMutation = useMutation({
    mutationFn: (supermarketId?: number) =>
      scraperApi.trigger(supermarketId, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scraperStatus'] });
    },
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusIcon = (logStatus: string) => {
    switch (logStatus) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-slate-400" />;
    }
  };

  if (statusLoading) {
    return <Loading text="Loading scraper status..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Scraper Control</h1>
          <p className="text-slate-600 mt-1">
            Monitor and trigger scrapers for each supermarket.
          </p>
        </div>
        <button
          onClick={() => refetchStatus()}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-slate-500">Currently Running</p>
          <p className="text-2xl font-bold text-blue-600">
            {status?.stats_24h?.currently_running || 0}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Success (24h)</p>
          <p className="text-2xl font-bold text-green-600">
            {status?.stats_24h?.success_24h || 0}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Failed (24h)</p>
          <p className="text-2xl font-bold text-red-600">
            {status?.stats_24h?.failed_24h || 0}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Products Scraped (24h)</p>
          <p className="text-2xl font-bold text-slate-900">
            {status?.stats_24h?.products_24h?.toLocaleString() || 0}
          </p>
        </div>
      </div>

      {/* Trigger All */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Run All Scrapers
            </h2>
            <p className="text-sm text-slate-500">
              Trigger all active scrapers sequentially
            </p>
          </div>
          <button
            onClick={() => triggerMutation.mutate(undefined)}
            disabled={triggerMutation.isPending || (status?.stats_24h?.currently_running || 0) > 0}
            className="btn-primary flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            Run All
          </button>
        </div>
      </div>

      {/* Running Scrapers */}
      {status?.running_scrapers && status.running_scrapers.length > 0 && (
        <div className="card border-blue-200 bg-blue-50">
          <h2 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Currently Running
          </h2>
          <div className="space-y-2">
            {(status.running_scrapers as ScrapeLog[]).map((scraper) => (
              <div
                key={scraper.id}
                className="p-3 bg-white rounded-lg border border-blue-200"
              >
                <p className="font-medium text-slate-900">
                  {scraper.supermarket_name}
                </p>
                <p className="text-sm text-slate-500">
                  Started: {formatDate(scraper.started_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supermarkets by Country */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Supermarkets by Country
        </h2>
        {countries.map((country: Country) => (
          <div key={country.id} className="card">
            <h3 className="text-md font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <span className="text-xl">{country.flag_emoji}</span>
              {country.name}
            </h3>
            {country.supermarkets && country.supermarkets.length > 0 ? (
              <div className="space-y-2">
                {country.supermarkets.map((sm: Supermarket) => (
                  <div
                    key={sm.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{sm.name}</p>
                      <p className="text-xs text-slate-500">
                        {sm.is_active ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                    <button
                      onClick={() => triggerMutation.mutate(sm.id)}
                      disabled={
                        triggerMutation.isPending || !sm.is_active
                      }
                      className="btn-secondary py-1 px-3 text-sm flex items-center gap-1"
                    >
                      <Play className="h-3 w-3" />
                      Run
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No supermarkets configured</p>
            )}
          </div>
        ))}
      </div>

      {/* Recent Logs */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Recent Scrape Logs
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Supermarket
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Started
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Duration
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Products
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  Errors
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(status?.recent_logs as ScrapeLog[] || []).map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">{getStatusIcon(log.status)}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">
                      {log.supermarket_name}
                    </p>
                    <p className="text-xs text-slate-500">{log.country_name}</p>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {formatDate(log.started_at)}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {formatDuration(log.duration_seconds)}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {log.products_scraped?.toLocaleString() || '-'}
                  </td>
                  <td className="py-3 px-4">
                    {log.products_failed ? (
                      <span className="text-sm text-red-600">
                        {log.products_failed}
                      </span>
                    ) : log.error_message ? (
                      <span
                        className="text-sm text-red-600 flex items-center gap-1"
                        title={log.error_message}
                      >
                        <AlertCircle className="h-4 w-4" />
                        Error
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
