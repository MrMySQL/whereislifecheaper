import { useState, useMemo } from 'react';
import { TrendingDown, Tag, Trophy, Package, ImageOff, Store, Calendar, Calculator } from 'lucide-react';
import type { CanonicalProduct, CountryPrice } from '../../types';
import { formatPrice, convertToEUR, findCheapestCountry } from '../../utils/currency';

interface ComparisonTableProps {
  products: CanonicalProduct[];
  selectedCountries: string[];
  loading?: boolean;
}

function ProductHoverCard({ priceData }: { priceData: CountryPrice }) {
  const scrapedDate = priceData.scraped_at
    ? new Date(priceData.scraped_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white rounded-lg shadow-xl border border-cream-200 p-3 pointer-events-none">
      {/* Arrow */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-cream-200 rotate-45" />

      <div className="relative">
        {/* Product Image */}
        <div className="flex gap-3 mb-2">
          <div className="w-16 h-16 bg-cream-100 rounded-lg overflow-hidden flex-shrink-0">
            {priceData.image_url ? (
              <img
                src={priceData.image_url}
                alt={priceData.product_name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-6 h-6 text-cream-400" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-charcoal-900 text-sm leading-tight line-clamp-2">
              {priceData.product_name}
            </p>
            {priceData.brand && (
              <p className="text-xs text-charcoal-500 mt-0.5">{priceData.brand}</p>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-xs">
          {/* Unit */}
          {priceData.unit && (
            <div className="flex justify-between text-charcoal-600">
              <span>Size:</span>
              <span className="font-medium">
                {priceData.unit_quantity && priceData.unit_quantity > 1
                  ? `${priceData.unit_quantity} × `
                  : ''
                }
                {priceData.unit}
              </span>
            </div>
          )}

          {/* Supermarket */}
          <div className="flex items-center justify-between text-charcoal-600">
            <span className="flex items-center gap-1">
              <Store className="w-3 h-3" />
              Store:
            </span>
            <span className="font-medium">{priceData.supermarket}</span>
          </div>

          {/* Price in local currency */}
          <div className="flex justify-between text-charcoal-600">
            <span>Local price:</span>
            <span className="font-semibold text-charcoal-900">
              {formatPrice(priceData.price, priceData.currency)}
            </span>
          </div>

          {/* Original price if on sale */}
          {priceData.is_on_sale && priceData.original_price && (
            <div className="flex justify-between text-charcoal-600">
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3 text-terracotta-500" />
                Was:
              </span>
              <span className="line-through text-charcoal-400">
                {formatPrice(priceData.original_price, priceData.currency)}
              </span>
            </div>
          )}

          {/* Last updated */}
          {scrapedDate && (
            <div className="flex items-center justify-between text-charcoal-400 pt-1 border-t border-cream-100">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Updated:
              </span>
              <span>{scrapedDate}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceCell({ priceData, isCheapest }: { priceData: CountryPrice; isCheapest: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  const eurPrice = convertToEUR(priceData.price, priceData.currency);

  return (
    <td
      className={`text-center py-2.5 px-3 relative ${isCheapest ? 'bg-olive-50/60' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* EUR price (main) */}
      <p className={`font-bold ${isCheapest ? 'text-olive-700' : 'text-charcoal-800'}`}>
        €{eurPrice.toFixed(2)}
      </p>
      {/* Original price (small) */}
      <p className="text-[10px] text-charcoal-400">
        {formatPrice(priceData.price, priceData.currency)}
      </p>
      {priceData.is_on_sale && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-terracotta-600">
          <Tag className="h-2.5 w-2.5" />
          Sale
        </span>
      )}

      {/* Hover Card */}
      {isHovered && <ProductHoverCard priceData={priceData} />}
    </td>
  );
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

  // Calculate summary totals per country
  const summaryData = useMemo(() => {
    const totals: Record<string, { total: number; count: number }> = {};

    selectedCountries.forEach((code) => {
      totals[code] = { total: 0, count: 0 };
    });

    products.forEach((product) => {
      selectedCountries.forEach((code) => {
        const priceData = product.prices_by_country[code];
        if (priceData) {
          const eurPrice = convertToEUR(priceData.price, priceData.currency);
          totals[code].total += eurPrice;
          totals[code].count += 1;
        }
      });
    });

    // Find cheapest country by total
    let cheapestCode: string | null = null;
    let cheapestTotal = Infinity;

    selectedCountries.forEach((code) => {
      if (totals[code].count > 0 && totals[code].total < cheapestTotal) {
        cheapestTotal = totals[code].total;
        cheapestCode = code;
      }
    });

    // Calculate savings percentage
    const otherTotals = selectedCountries
      .filter((code) => code !== cheapestCode && totals[code].count > 0)
      .map((code) => totals[code].total);

    const avgOthers = otherTotals.length > 0
      ? otherTotals.reduce((sum, t) => sum + t, 0) / otherTotals.length
      : 0;

    const savings = avgOthers > 0 && cheapestCode
      ? Math.round(((avgOthers - cheapestTotal) / avgOthers) * 100)
      : 0;

    return { totals, cheapestCode, savings };
  }, [products, selectedCountries]);

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
                      <PriceCell
                        key={code}
                        priceData={priceData}
                        isCheapest={isCheapest}
                      />
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
          <tfoot>
            <tr className="bg-cream-100 border-t-2 border-cream-300">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-charcoal-500" />
                  <span className="font-display font-semibold text-charcoal-700">
                    Total
                  </span>
                  <span className="text-xs text-charcoal-400">
                    ({products.length} products)
                  </span>
                </div>
              </td>
              {selectedCountries.map((code) => {
                const data = summaryData.totals[code];
                const isCheapest = summaryData.cheapestCode === code;

                return (
                  <td
                    key={code}
                    className={`text-center py-3 px-3 ${isCheapest ? 'bg-olive-100' : ''}`}
                  >
                    {data.count > 0 ? (
                      <>
                        <p className={`font-bold text-base ${isCheapest ? 'text-olive-700' : 'text-charcoal-800'}`}>
                          €{data.total.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-charcoal-400">
                          {data.count} items
                        </p>
                      </>
                    ) : (
                      <span className="text-cream-400">—</span>
                    )}
                  </td>
                );
              })}
              <td className="text-center py-3 px-3">
                {summaryData.cheapestCode && (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="font-bold text-saffron-700">{summaryData.cheapestCode}</span>
                    {summaryData.savings > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-olive-600 font-medium">
                        <TrendingDown className="h-2.5 w-2.5" />
                        {summaryData.savings}%
                      </span>
                    )}
                  </div>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
