import { Link } from 'react-router-dom';
import { Store, Package, Coins, Clock } from 'lucide-react';
import type { PriceStats } from '../../types';
import { formatPrice } from '../../utils/currency';

interface CountryCardProps {
  stats: PriceStats;
}

export default function CountryCard({ stats }: CountryCardProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isRecent = stats.last_scrape && new Date(stats.last_scrape).getTime() > Date.now() - 24 * 60 * 60 * 1000;

  return (
    <Link to={`/country/${stats.country_code.toLowerCase()}`} className="block">
      <div className="card !p-4 hover:shadow-md transition-shadow cursor-pointer">
        {/* Header row */}
        <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cream-100 to-cream-200 flex items-center justify-center text-2xl">
          {stats.flag_emoji}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-display font-bold text-charcoal-900 truncate">
            {stats.country_name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-charcoal-500">{stats.country_code}</span>
            <span className="badge-saffron !text-[10px] !px-1.5 !py-0.5">{stats.currency_code}</span>
          </div>
        </div>
        {isRecent && (
          <span className="w-2 h-2 rounded-full bg-olive-500 animate-pulse" title="Recently updated" />
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center p-2 rounded-lg bg-olive-50 border border-olive-100">
          <Package className="h-3.5 w-3.5 text-olive-600 mx-auto mb-1" />
          <p className="text-sm font-bold text-charcoal-900">{stats.product_count?.toLocaleString() || 0}</p>
          <p className="text-[10px] text-charcoal-500">Products</p>
        </div>

        <div className="text-center p-2 rounded-lg bg-saffron-50 border border-saffron-100">
          <Store className="h-3.5 w-3.5 text-saffron-600 mx-auto mb-1" />
          <p className="text-sm font-bold text-charcoal-900">{stats.supermarket_count}</p>
          <p className="text-[10px] text-charcoal-500">Stores</p>
        </div>

        <div className="text-center p-2 rounded-lg bg-terracotta-50 border border-terracotta-100">
          <Coins className="h-3.5 w-3.5 text-terracotta-600 mx-auto mb-1" />
          <p className="text-sm font-bold text-charcoal-900 truncate">
            {stats.avg_price ? formatPrice(Number(stats.avg_price), stats.currency_code) : 'N/A'}
          </p>
          <p className="text-[10px] text-charcoal-500">Avg</p>
        </div>

        <div className="text-center p-2 rounded-lg bg-cream-100 border border-cream-200">
          <Clock className="h-3.5 w-3.5 text-charcoal-500 mx-auto mb-1" />
          <p className={`text-sm font-bold truncate ${isRecent ? 'text-olive-600' : 'text-charcoal-600'}`}>
            {formatDate(stats.last_scrape)}
          </p>
          <p className="text-[10px] text-charcoal-500">Updated</p>
        </div>
      </div>
      </div>
    </Link>
  );
}
