import React, { useState, useMemo } from 'react';
import { TrendingDown, Tag, Trophy, Package, ImageOff, Store, Calendar, Calculator, ChevronDown } from 'lucide-react';
import type { CanonicalProduct, CountryPrice, Country } from '../../types';
import { formatPrice, convertToEUR, findCheapestCountry, isNormalizableUnit, getUnitLabel, formatPackageSize } from '../../utils/currency';
import PriceHistoryChart from './PriceHistoryChart';

interface ComparisonTableProps {
  products: CanonicalProduct[];
  selectedCountries: string[];
  countries: Country[];
  loading?: boolean;
}

function SingleProductCard({ priceData }: { priceData: CountryPrice }) {
  const scrapedDate = priceData.scraped_at
    ? new Date(priceData.scraped_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
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
  );
}

function MultiProductCard({ priceData }: { priceData: CountryPrice }) {
  const products = priceData.products || [];

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-3 pb-2 border-b border-cream-200">
        <p className="font-semibold text-charcoal-900 text-sm">
          Average of {priceData.product_count} products
        </p>
        <p className="text-xs text-charcoal-500">
          Avg: {formatPrice(priceData.price, priceData.currency)}
        </p>
      </div>

      {/* Product list */}
      <div className="space-y-2.5">
        {products.map((product) => (
          <div key={product.product_id} className="flex gap-2 pb-2 border-b border-cream-100 last:border-0 last:pb-0">
            {/* Thumbnail */}
            <div className="w-10 h-10 bg-cream-100 rounded overflow-hidden flex-shrink-0">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.product_name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-4 h-4 text-cream-400" />
                </div>
              )}
            </div>
            {/* Product info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-charcoal-900 line-clamp-1">
                {product.product_name}
              </p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-charcoal-400 flex items-center gap-0.5">
                  <Store className="w-2.5 h-2.5" />
                  {product.supermarket}
                </span>
                <span className="text-xs font-semibold text-charcoal-800">
                  {formatPrice(product.price, priceData.currency)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductHoverCard({ priceData, showBelow = false }: { priceData: CountryPrice; showBelow?: boolean }) {
  const positionClasses = showBelow
    ? 'top-full mt-2'
    : 'bottom-full mb-2';

  const isMultiProduct = priceData.product_count > 1;
  const cardWidth = isMultiProduct ? 'w-72' : 'w-64';

  return (
    <div className={`absolute z-50 ${positionClasses} left-1/2 -translate-x-1/2 ${cardWidth} bg-white rounded-lg shadow-xl border border-cream-200 p-3 pointer-events-none`}>
      {/* Arrow */}
      {showBelow ? (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-l border-t border-cream-200 rotate-45" />
      ) : (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-cream-200 rotate-45" />
      )}

      {isMultiProduct ? (
        <MultiProductCard priceData={priceData} />
      ) : (
        <SingleProductCard priceData={priceData} />
      )}
    </div>
  );
}

function PriceCell({ priceData, isCheapest, rowIndex, showPerUnitPrice }: { priceData: CountryPrice; isCheapest: boolean; rowIndex: number; showPerUnitPrice: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  // Show hover card below for first 3 rows to avoid clipping
  const showBelow = rowIndex < 3;

  // Determine if we should show normalized price - only if toggle is enabled
  const hasNormalizedPrice = showPerUnitPrice && isNormalizableUnit(priceData.unit) && priceData.price_per_unit != null;

  // EUR conversion - use normalized price if available and enabled
  const displayPrice = hasNormalizedPrice ? priceData.price_per_unit! : priceData.price;
  const eurPrice = convertToEUR(displayPrice, priceData.currency);
  const unitLabel = getUnitLabel(priceData.unit);
  const packageSize = formatPackageSize(priceData.unit_quantity, priceData.unit);

  return (
    <td
      className={`text-center py-2.5 px-3 relative ${isCheapest ? 'bg-olive-50/60' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Primary: EUR per-unit price (or total if no normalization) */}
      <p className={`font-bold ${isCheapest ? 'text-olive-700' : 'text-charcoal-800'}`}>
        €{eurPrice.toFixed(2)}{hasNormalizedPrice && unitLabel ? `/${unitLabel}` : ''}
      </p>
      {/* Secondary: Package price in local currency */}
      <p className="text-[10px] text-charcoal-400">
        {formatPrice(priceData.price, priceData.currency)}
        {hasNormalizedPrice && packageSize ? (
          <span className="ml-0.5">for {packageSize}</span>
        ) : null}
      </p>
      {/* Product count indicator for averages */}
      {priceData.product_count > 1 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600">
          (avg of {priceData.product_count})
        </span>
      )}
      {priceData.is_on_sale && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-terracotta-600">
          <Tag className="h-2.5 w-2.5" />
          Sale
        </span>
      )}

      {/* Hover Card */}
      {isHovered && <ProductHoverCard priceData={priceData} showBelow={showBelow} />}
    </td>
  );
}

export default function ComparisonTable({
  products,
  selectedCountries,
  countries,
  loading = false,
}: ComparisonTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRowExpanded = (canonicalId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(canonicalId)) {
        next.delete(canonicalId);
      } else {
        next.add(canonicalId);
      }
      return next;
    });
  };

  // Calculate summary totals per country - must be before early returns to satisfy Rules of Hooks
  const summaryData = useMemo(() => {
    const totals: Record<string, { total: number; count: number }> = {};

    selectedCountries.forEach((code) => {
      totals[code] = { total: 0, count: 0 };
    });

    products.forEach((product) => {
      selectedCountries.forEach((code) => {
        const priceData = product.prices_by_country[code];
        if (priceData) {
          // Use normalized price only if toggle is enabled and unit data is available
          const hasNormalizedPrice = product.show_per_unit_price && isNormalizableUnit(priceData.unit) && priceData.price_per_unit != null;
          const priceToUse = hasNormalizedPrice ? priceData.price_per_unit! : priceData.price;
          const eurPrice = convertToEUR(priceToUse, priceData.currency);
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
            {products.map((product, rowIndex) => {
              // Only consider selected countries when finding cheapest
              const cheapest = findCheapestCountry(
                Object.fromEntries(
                  Object.entries(product.prices_by_country)
                    .filter(([code]) => selectedCountries.includes(code))
                    .map(([code, data]) => [
                      code,
                      {
                        price: data.price,
                        currency: data.currency,
                        price_per_unit: data.price_per_unit,
                        unit: data.unit,
                      },
                    ])
                ),
                product.show_per_unit_price
              );

              const isExpanded = expandedRows.has(product.canonical_id);

              return (
                <React.Fragment key={product.canonical_id}>
                  <tr
                    className={`border-b border-cream-100 hover:bg-cream-50/50 transition-colors cursor-pointer ${
                      isExpanded ? 'bg-cream-50/30' : ''
                    }`}
                    onClick={() => toggleRowExpanded(product.canonical_id)}
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-3">
                        {/* Expand/Collapse indicator */}
                        <ChevronDown
                          className={`w-4 h-4 text-charcoal-400 transition-transform duration-200 flex-shrink-0 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                        {/* Product image - find first real image URL from selected countries only */}
                        {(() => {
                          const prices = selectedCountries
                            .map(code => product.prices_by_country[code])
                            .filter(Boolean);
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
                        <div className={`w-10 h-10 rounded-lg bg-cream-100 flex items-center justify-center flex-shrink-0 ${selectedCountries.some(code => product.prices_by_country[code]?.image_url?.startsWith('http')) ? 'hidden' : ''}`}>
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
                          rowIndex={rowIndex}
                          showPerUnitPrice={product.show_per_unit_price}
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

                  {/* Expanded row with chart */}
                  {isExpanded && (
                    <tr>
                      <td
                        colSpan={selectedCountries.length + 2}
                        className="p-0 border-b border-cream-100"
                      >
                        <div className="p-4" onClick={(e) => e.stopPropagation()}>
                          <PriceHistoryChart
                            product={product}
                            selectedCountries={selectedCountries}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
                const country = countries.find((c) => c.code === code);

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
                        {country && (
                          <p className="text-lg mt-1" title={country.name}>
                            {country.flag_emoji}
                          </p>
                        )}
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
                    {(() => {
                      const cheapestCountry = countries.find((c) => c.code === summaryData.cheapestCode);
                      return cheapestCountry ? (
                        <span className="text-lg mt-0.5" title={cheapestCountry.name}>
                          {cheapestCountry.flag_emoji}
                        </span>
                      ) : null;
                    })()}
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
