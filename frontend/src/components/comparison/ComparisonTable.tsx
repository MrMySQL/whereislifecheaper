import { TrendingDown, Tag, Trophy, Package, ImageOff } from 'lucide-react';
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
      <div className="card !p-3">
        <div className="space-y-2">
          <div className="skeleton h-8 w-full rounded-lg" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="card text-center py-8">
        <Package className="w-8 h-8 text-cream-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-charcoal-600">No products found</p>
        <p className="text-xs text-charcoal-400 mt-1">Try different countries or search terms</p>
      </div>
    );
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cream-50 border-b border-cream-200">
              <th className="text-left py-2.5 px-4 font-display font-semibold text-charcoal-700">
                Product
              </th>
              {selectedCountries.map((code) => (
                <th key={code} className="text-center py-2.5 px-3 font-display font-semibold text-charcoal-700 min-w-[110px]">
                  {code}
                </th>
              ))}
              <th className="text-center py-2.5 px-3 font-display font-semibold text-charcoal-700 min-w-[80px]">
                <span className="inline-flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-saffron-500" />
                  Best
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
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
                <tr key={product.canonical_id} className="border-b border-cream-100 hover:bg-cream-50/50 transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      {/* Product image - find first real image URL (prefer http/https over local paths) */}
                      {(() => {
                        const prices = Object.values(product.prices_by_country);
                        const imageUrl = prices.find(p => p.image_url?.startsWith('http'))?.image_url
                          || prices.find(p => p.image_url && !p.image_url.includes('default'))?.image_url;
                        return imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={product.canonical_name}
                            className="w-10 h-10 rounded-lg object-cover bg-cream-100 flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                            }}
                          />
                        ) : null;
                      })()}
                      <div className={`w-10 h-10 rounded-lg bg-cream-100 flex items-center justify-center flex-shrink-0 ${Object.values(product.prices_by_country).some(p => p.image_url?.startsWith('http')) ? 'hidden' : ''}`}>
                        <ImageOff className="w-4 h-4 text-cream-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-charcoal-900 truncate max-w-[180px]">
                          {product.canonical_name}
                        </p>
                        {product.category && (
                          <span className="text-[10px] text-charcoal-400">{product.category}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {selectedCountries.map((code) => {
                    const priceData = product.prices_by_country[code];
                    const isCheapest = cheapest?.code === code;

                    if (!priceData) {
                      return (
                        <td key={code} className="text-center py-2.5 px-3">
                          <span className="text-cream-400">—</span>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={code}
                        className={`text-center py-2.5 px-3 ${isCheapest ? 'bg-olive-50/60' : ''}`}
                      >
                        <p className={`font-bold ${isCheapest ? 'text-olive-700' : 'text-charcoal-800'}`}>
                          {formatPrice(priceData.price, priceData.currency)}
                        </p>
                        <p className="text-[10px] text-charcoal-400">
                          ≈ ${convertToUSD(priceData.price, priceData.currency).toFixed(2)}
                        </p>
                        {priceData.is_on_sale && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-terracotta-600">
                            <Tag className="h-2.5 w-2.5" />
                            Sale
                          </span>
                        )}
                      </td>
                    );
                  })}

                  <td className="text-center py-2.5 px-3">
                    {cheapest && (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-bold text-saffron-700">{cheapest.code}</span>
                        {cheapest.savings > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-olive-600 font-medium">
                            <TrendingDown className="h-2.5 w-2.5" />
                            {cheapest.savings}%
                          </span>
                        )}
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
