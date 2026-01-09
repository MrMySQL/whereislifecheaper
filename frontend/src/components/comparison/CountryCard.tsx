import { Store, Package, DollarSign, Clock } from 'lucide-react';
import type { PriceStats } from '../../types';
import { formatPrice } from '../../utils/currency';

interface CountryCardProps {
  stats: PriceStats;
}

export default function CountryCard({ stats }: CountryCardProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-4xl mb-2 block">{stats.flag_emoji}</span>
          <h3 className="text-lg font-semibold text-slate-900">{stats.country_name}</h3>
          <p className="text-sm text-slate-500">{stats.country_code}</p>
        </div>
        <span className="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
          {stats.currency_code}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Package className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Products</p>
            <p className="font-semibold text-slate-900">
              {stats.product_count?.toLocaleString() || 0}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Store className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Stores</p>
            <p className="font-semibold text-slate-900">{stats.supermarket_count}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-100 rounded-lg">
            <DollarSign className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Avg Price</p>
            <p className="font-semibold text-slate-900">
              {stats.avg_price
                ? formatPrice(Number(stats.avg_price), stats.currency_code)
                : 'N/A'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Clock className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Updated</p>
            <p className="font-semibold text-slate-900 text-xs">
              {formatDate(stats.last_scrape)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
