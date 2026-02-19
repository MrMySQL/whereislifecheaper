import { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Calendar } from 'lucide-react';
import { productsApi } from '../../services/api';
import { convertToEUR } from '../../utils/currency';
import { formatDateTime } from '../../utils/dateFormat';
import type { CanonicalProduct } from '../../types';

interface PriceHistoryChartProps {
  product: CanonicalProduct;
  selectedCountries: string[];
}

type DateRange = 7 | 30 | 90;

// Color palette matching design system
const COUNTRY_COLORS: Record<string, string> = {
  TR: '#c45d35', // terracotta-600
  ES: '#5d694c', // olive-600
  ME: '#c48b2a', // saffron-600
  UZ: '#4f4f4f', // charcoal-700
};

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-cream-200 p-3">
      <p className="text-xs text-charcoal-500 mb-2">
        {formatDateTime(label || '', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-medium text-charcoal-700">{entry.dataKey}:</span>
            <span className="text-charcoal-900">{'\u20AC'}{entry.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PriceHistoryChart({
  product,
  selectedCountries,
}: PriceHistoryChartProps) {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange>(30);

  // Get product IDs for each selected country
  const countryProductIds = useMemo(() => {
    return selectedCountries
      .map((code) => {
        const priceData = product.prices_by_country[code];
        if (!priceData) return null;
        return {
          code,
          productId: priceData.product_id,
          currency: priceData.currency,
          countryName: priceData.country_name,
        };
      })
      .filter(Boolean) as Array<{
        code: string;
        productId: number;
        currency: string;
        countryName: string;
      }>;
  }, [product, selectedCountries]);

  // Fetch price history for each country in parallel
  const priceHistoryQueries = useQueries({
    queries: countryProductIds.map((item) => ({
      queryKey: ['priceHistory', item.productId, dateRange],
      queryFn: () => productsApi.getPriceHistory(item.productId, dateRange),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })),
  });

  const isLoading = priceHistoryQueries.some((q) => q.isLoading);
  const isError = priceHistoryQueries.some((q) => q.isError);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    if (isLoading || isError) return [];

    // Collect all dates and prices
    const dateMap = new Map<string, Record<string, number | string>>();

    priceHistoryQueries.forEach((query, index) => {
      if (!query.data?.data) return;
      const countryInfo = countryProductIds[index];

      query.data.data.forEach((entry) => {
        const dateKey = new Date(entry.scraped_at).toISOString().split('T')[0];
        const eurPrice = convertToEUR(entry.price, countryInfo.currency);

        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { date: dateKey });
        }
        const dateEntry = dateMap.get(dateKey)!;
        // Use latest price if multiple per day
        dateEntry[countryInfo.code] = eurPrice;
      });
    });

    // Sort by date
    return Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
    );
  }, [priceHistoryQueries, countryProductIds, isLoading, isError]);

  if (isLoading) {
    return (
      <div className="p-6 bg-cream-50/50 rounded-xl">
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-5 h-5 border-2 border-terracotta-300 border-t-terracotta-600 rounded-full animate-spin" />
          <span className="text-sm text-charcoal-600">{t('priceHistory.loadingHistory')}</span>
        </div>
      </div>
    );
  }

  if (isError || chartData.length === 0) {
    return (
      <div className="p-6 bg-cream-50/50 rounded-xl">
        <p className="text-sm text-charcoal-500 text-center py-4">
          {t('priceHistory.noHistory')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-cream-50/50 rounded-xl">
      {/* Date Range Selector */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-charcoal-600">
          <Calendar className="w-4 h-4" />
          <span className="font-medium">{t('priceHistory.priceHistory')}</span>
        </div>
        <div className="flex gap-1">
          {([7, 30, 90] as DateRange[]).map((days) => (
            <button
              key={days}
              onClick={(e) => {
                e.stopPropagation();
                setDateRange(days);
              }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                dateRange === days
                  ? 'bg-terracotta-500 text-white'
                  : 'bg-white text-charcoal-600 hover:bg-cream-100 border border-cream-200'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8ebe2" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) =>
              formatDateTime(date, { month: 'short', day: 'numeric' })
            }
            tick={{ fontSize: 10, fill: '#6d6d6d' }}
            axisLine={{ stroke: '#d2d8c7' }}
          />
          <YAxis
            tickFormatter={(value) => `\u20AC${value.toFixed(0)}`}
            tick={{ fontSize: 10, fill: '#6d6d6d' }}
            axisLine={{ stroke: '#d2d8c7' }}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
            iconType="circle"
            iconSize={8}
          />
          {countryProductIds.map((item) => (
            <Line
              key={item.code}
              type="monotone"
              dataKey={item.code}
              name={item.code}
              stroke={COUNTRY_COLORS[item.code] || '#888888'}
              strokeWidth={2}
              dot={{ r: 3, fill: COUNTRY_COLORS[item.code] || '#888888' }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
