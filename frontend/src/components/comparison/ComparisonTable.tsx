import { TrendingDown, Tag } from 'lucide-react';
import type { CanonicalProduct } from '../../types';
import { formatPrice, convertToUSD, findCheapestCountry } from '../../utils/currency';

interface ComparisonTableProps {
  products: CanonicalProduct[];
  selectedCountries: string[];
  loading?: boolean;
}

export default function ComparisonTable({
  products,
  selectedCountries,
  loading = false,
}: ComparisonTableProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-200 rounded w-full" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-slate-500">No products found matching your criteria.</p>
        <p className="text-sm text-slate-400 mt-1">
          Try selecting different countries or adjusting your search.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left py-4 px-6 font-semibold text-slate-700">
                Product
              </th>
              {selectedCountries.map((code) => (
                <th key={code} className="text-center py-4 px-4 font-semibold text-slate-700 min-w-[140px]">
                  {code}
                </th>
              ))}
              <th className="text-center py-4 px-4 font-semibold text-slate-700 min-w-[120px]">
                Best Deal
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((product) => {
              const cheapest = findCheapestCountry(
                Object.fromEntries(
                  Object.entries(product.prices_by_country).map(([code, data]) => [
                    code,
                    { price: data.price, currency: data.currency },
                  ])
                )
              );

              return (
                <tr key={product.canonical_id} className="hover:bg-slate-50">
                  <td className="py-4 px-6">
                    <div>
                      <p className="font-medium text-slate-900">
                        {product.canonical_name}
                      </p>
                      {product.category && (
                        <p className="text-sm text-slate-500">{product.category}</p>
                      )}
                    </div>
                  </td>
                  {selectedCountries.map((code) => {
                    const priceData = product.prices_by_country[code];
                    const isCheapest = cheapest?.code === code;

                    if (!priceData) {
                      return (
                        <td key={code} className="text-center py-4 px-4">
                          <span className="text-slate-400">-</span>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={code}
                        className={`text-center py-4 px-4 ${
                          isCheapest ? 'bg-green-50' : ''
                        }`}
                      >
                        <div className="space-y-1">
                          <p
                            className={`font-semibold ${
                              isCheapest ? 'text-green-700' : 'text-slate-900'
                            }`}
                          >
                            {formatPrice(priceData.price, priceData.currency)}
                          </p>
                          <p className="text-xs text-slate-500">
                            ≈ ${convertToUSD(priceData.price, priceData.currency).toFixed(2)}
                          </p>
                          {priceData.is_on_sale && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">
                              <Tag className="h-3 w-3" />
                              Sale
                            </span>
                          )}
                          <p className="text-xs text-slate-400 truncate max-w-[120px]">
                            {priceData.supermarket}
                          </p>
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-center py-4 px-4">
                    {cheapest && (
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-lg">
                          {
                            products[0]?.prices_by_country[cheapest.code]
                              ? '✓'
                              : ''
                          }
                        </span>
                        <div>
                          <p className="font-medium text-green-600">
                            {cheapest.code}
                          </p>
                          {cheapest.savings > 0 && (
                            <p className="text-xs text-green-600 flex items-center gap-1">
                              <TrendingDown className="h-3 w-3" />
                              {cheapest.savings}% cheaper
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
