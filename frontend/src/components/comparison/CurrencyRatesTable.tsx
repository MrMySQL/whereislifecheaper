import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, TrendingUp, Clock, RefreshCw, Database, Cloud, AlertCircle } from 'lucide-react';
import { ratesApi } from '../../services/api';

// Currency metadata (symbols, names, flags)
const currencyMeta: Record<string, { symbol: string; name: string; flag: string }> = {
  EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺' },
  USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  TRY: { symbol: '₺', name: 'Turkish Lira', flag: '🇹🇷' },
  UZS: { symbol: "so'm", name: 'Uzbek Som', flag: '🇺🇿' },
  UAH: { symbol: '₴', name: 'Ukrainian Hryvnia', flag: '🇺🇦' },
  KZT: { symbol: '₸', name: 'Kazakhstani Tenge', flag: '🇰🇿' },
};

// Format large numbers with abbreviations
function formatInverse(rate: number): string {
  const inverse = 1 / rate;
  if (inverse >= 1000000) {
    return `${(inverse / 1000000).toFixed(2)}M`;
  }
  if (inverse >= 1000) {
    return `${(inverse / 1000).toFixed(1)}K`;
  }
  return inverse.toFixed(2);
}

// Color configurations for each currency
const currencyStyles: Record<string, {
  cardBg: string;
  headerText: string;
  symbolText: string;
  rateText: string;
  badge: string;
  hoverBorder: string;
  flipBtnHover: string;
  flipIcon: string;
  cornerAccent: string;
}> = {
  EUR: {
    cardBg: 'from-olive-50 to-olive-100/80',
    headerText: 'text-olive-800',
    symbolText: 'text-olive-800',
    rateText: 'text-olive-700',
    badge: 'bg-olive-100 text-olive-700',
    hoverBorder: 'hover:border-olive-300/50',
    flipBtnHover: 'hover:border-olive-200',
    flipIcon: 'text-olive-600',
    cornerAccent: 'bg-olive-200/30',
  },
  USD: {
    cardBg: 'from-saffron-50 to-saffron-100/80',
    headerText: 'text-saffron-800',
    symbolText: 'text-saffron-800',
    rateText: 'text-saffron-700',
    badge: 'bg-saffron-100 text-saffron-700',
    hoverBorder: 'hover:border-saffron-300/50',
    flipBtnHover: 'hover:border-saffron-200',
    flipIcon: 'text-saffron-600',
    cornerAccent: 'bg-saffron-200/30',
  },
  TRY: {
    cardBg: 'from-terracotta-50 to-terracotta-100/80',
    headerText: 'text-terracotta-800',
    symbolText: 'text-terracotta-800',
    rateText: 'text-terracotta-700',
    badge: 'bg-terracotta-100 text-terracotta-700',
    hoverBorder: 'hover:border-terracotta-300/50',
    flipBtnHover: 'hover:border-terracotta-200',
    flipIcon: 'text-terracotta-600',
    cornerAccent: 'bg-terracotta-200/30',
  },
  UZS: {
    cardBg: 'from-sky-50 to-sky-100/80',
    headerText: 'text-sky-800',
    symbolText: 'text-sky-800',
    rateText: 'text-sky-700',
    badge: 'bg-sky-100 text-sky-700',
    hoverBorder: 'hover:border-sky-300/50',
    flipBtnHover: 'hover:border-sky-200',
    flipIcon: 'text-sky-600',
    cornerAccent: 'bg-sky-200/30',
  },
  UAH: {
    cardBg: 'from-amber-50 to-amber-100/80',
    headerText: 'text-amber-800',
    symbolText: 'text-amber-800',
    rateText: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
    hoverBorder: 'hover:border-amber-300/50',
    flipBtnHover: 'hover:border-amber-200',
    flipIcon: 'text-amber-600',
    cornerAccent: 'bg-amber-200/30',
  },
  KZT: {
    cardBg: 'from-indigo-50 to-indigo-100/80',
    headerText: 'text-indigo-800',
    symbolText: 'text-indigo-800',
    rateText: 'text-indigo-700',
    badge: 'bg-indigo-100 text-indigo-700',
    hoverBorder: 'hover:border-indigo-300/50',
    flipBtnHover: 'hover:border-indigo-200',
    flipIcon: 'text-indigo-600',
    cornerAccent: 'bg-indigo-200/30',
  },
};

interface CurrencyCardProps {
  code: string;
  rate: number;
  index: number;
}

function CurrencyCard({ code, rate, index }: CurrencyCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const isEuro = code === 'EUR';
  const styles = currencyStyles[code] || currencyStyles.EUR;
  const meta = currencyMeta[code] || { symbol: code, name: code, flag: '🏳️' };

  return (
    <div
      className="group relative perspective-1000"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div
        className={`
          relative overflow-hidden rounded-xl border border-cream-200/60
          bg-gradient-to-br ${styles.cardBg}
          backdrop-blur-sm p-4
          transition-all duration-500 ease-out
          hover:shadow-lg
          ${styles.hoverBorder}
          hover:-translate-y-1
          cursor-pointer
          animate-fadeSlideUp
        `}
        onClick={() => !isEuro && setIsFlipped(!isFlipped)}
        style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'backwards' }}
      >
        {/* Decorative corner accent */}
        <div className={`absolute -top-6 -right-6 w-16 h-16 rounded-full ${styles.cornerAccent} blur-xl`} />

        {/* Flag and currency code header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label={meta.name}>
              {meta.flag}
            </span>
            <div>
              <span className={`font-display font-bold ${styles.headerText} text-sm`}>
                {code}
              </span>
              <p className="text-[10px] text-charcoal-500 leading-tight">{meta.name}</p>
            </div>
          </div>

          {!isEuro && (
            <button
              className={`
                p-1.5 rounded-lg bg-white/60 border border-cream-200/50
                opacity-0 group-hover:opacity-100 transition-opacity duration-300
                hover:bg-white/90 ${styles.flipBtnHover}
              `}
              title="Flip to see reverse rate"
            >
              <ArrowRightLeft className={`w-3.5 h-3.5 ${styles.flipIcon}`} />
            </button>
          )}
        </div>

        {/* Symbol showcase */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className={`text-3xl font-display font-bold ${styles.symbolText} tracking-tight`}>
            {meta.symbol}
          </span>
          {!isEuro && (
            <span className="text-xs text-charcoal-400">
              {isFlipped ? 'per €1' : '→ EUR'}
            </span>
          )}
        </div>

        {/* Rate display */}
        {isEuro ? (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium ${styles.badge} px-2 py-0.5 rounded-full`}>
              Base Currency
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            <div className={`
              flex items-baseline gap-1 transition-all duration-300
              ${isFlipped ? 'opacity-50 text-xs' : 'opacity-100'}
            `}>
              <span className={`font-mono text-lg font-semibold ${styles.rateText}`}>
                {rate < 0.01 ? rate.toExponential(2) : rate.toFixed(rate < 1 ? 4 : 2)}
              </span>
              <span className="text-[10px] text-charcoal-500">EUR</span>
            </div>

            <div className={`
              flex items-baseline gap-1 transition-all duration-300
              ${isFlipped ? 'opacity-100' : 'opacity-50 text-xs'}
            `}>
              <span className={`font-mono ${isFlipped ? 'text-lg font-semibold' : 'text-sm'} ${styles.rateText}`}>
                {formatInverse(rate)}
              </span>
              <span className="text-[10px] text-charcoal-500">{code}/EUR</span>
            </div>
          </div>
        )}

        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='1' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='1'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-cream-200/60 bg-cream-50 p-4 animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-cream-200" />
            <div className="space-y-1">
              <div className="h-3 w-10 bg-cream-200 rounded" />
              <div className="h-2 w-16 bg-cream-200 rounded" />
            </div>
          </div>
          <div className="h-8 w-12 bg-cream-200 rounded mb-2" />
          <div className="h-5 w-20 bg-cream-200 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function CurrencyRatesTable() {
  const { data: ratesData, isLoading, error } = useQuery({
    queryKey: ['exchangeRates'],
    queryFn: ratesApi.getRates,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  const formatLastUpdated = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'exchangerate-api':
        return <Cloud className="w-3 h-3" />;
      case 'database':
        return <Database className="w-3 h-3" />;
      default:
        return <AlertCircle className="w-3 h-3" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'exchangerate-api':
        return 'ExchangeRate API';
      case 'database':
        return 'Database';
      case 'fallback':
        return 'Fallback rates';
      default:
        return source;
    }
  };

  // Get currencies excluding EUR, then add EUR at the end
  const currencies = ratesData
    ? Object.entries(ratesData.data)
        .filter(([code]) => code !== 'EUR')
        .sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <section className="mt-8">
      {/* Section header with editorial styling */}
      <div className="relative mb-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-saffron-100 to-saffron-200/80 border border-saffron-200/50">
            <TrendingUp className="w-4 h-4 text-saffron-700" />
          </div>
          <h2 className="font-display font-bold text-lg text-charcoal-900">
            Exchange Rates
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-11">
          <p className="text-xs text-charcoal-500">
            Rates used for price conversion to EUR
          </p>
          {ratesData && (
            <>
              <div className="flex items-center gap-1.5 text-[10px] text-charcoal-400">
                {getSourceIcon(ratesData.source)}
                <span>{getSourceLabel(ratesData.source)}</span>
              </div>
              {ratesData.last_updated && (
                <div className="flex items-center gap-1.5 text-[10px] text-charcoal-400">
                  <Clock className="w-3 h-3" />
                  <span>{formatLastUpdated(ratesData.last_updated)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Decorative line */}
        <div className="absolute left-0 right-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cream-300 to-transparent" />
      </div>

      {/* Loading state */}
      {isLoading && <LoadingSkeleton />}

      {/* Error state */}
      {error && (
        <div className="text-center py-6 text-charcoal-500">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-terracotta-400" />
          <p className="text-sm">Failed to load exchange rates</p>
        </div>
      )}

      {/* Currency grid */}
      {ratesData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {currencies.map(([code, rate], index) => (
            <CurrencyCard key={code} code={code} rate={rate} index={index} />
          ))}

          {/* EUR card - base currency */}
          <CurrencyCard
            code="EUR"
            rate={1}
            index={currencies.length}
          />
        </div>
      )}

      {/* Footer note */}
      <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-charcoal-400">
        <RefreshCw className="w-3 h-3" />
        <span>Click cards to toggle rate direction</span>
        <span className="text-cream-400">|</span>
        <span>Rates synced daily from ExchangeRate API</span>
      </div>
    </section>
  );
}
