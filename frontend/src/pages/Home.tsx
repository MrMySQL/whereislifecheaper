import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, Globe2, TrendingDown, Sparkles } from 'lucide-react';
import { countriesApi, pricesApi, canonicalApi } from '../services/api';
import CountrySelector from '../components/comparison/CountrySelector';
import CountryCard from '../components/comparison/CountryCard';
import ComparisonTable from '../components/comparison/ComparisonTable';
import Loading from '../components/common/Loading';

const DEFAULT_COUNTRIES = ['TR', 'ES', 'ME'];

export default function Home() {
  const [selectedCountries, setSelectedCountries] = useState<string[]>(DEFAULT_COUNTRIES);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: countries = [], isLoading: countriesLoading } = useQuery({
    queryKey: ['countries'],
    queryFn: countriesApi.getAll,
  });

  const { data: priceStats = [], isLoading: statsLoading } = useQuery({
    queryKey: ['priceStats'],
    queryFn: pricesApi.getStats,
  });

  const {
    data: comparisonData,
    isLoading: comparisonLoading,
    refetch: refetchComparison,
  } = useQuery({
    queryKey: ['comparison', debouncedSearch],
    queryFn: () =>
      canonicalApi.getComparison({
        search: debouncedSearch || undefined,
        limit: 100,
      }),
  });

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) => {
      if (prev.includes(code)) {
        if (prev.length <= 2) return prev;
        return prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  };

  const selectedStats = priceStats.filter((s) =>
    selectedCountries.includes(s.country_code)
  );

  const filteredProducts = (comparisonData?.data || []).filter((product) => {
    const availableCountries = Object.keys(product.prices_by_country).filter(
      (code) => selectedCountries.includes(code)
    );
    return availableCountries.length >= 2;
  });

  if (countriesLoading) {
    return <Loading text="Loading countries..." />;
  }

  const totalProducts = priceStats.reduce((sum, s) => sum + (Number(s.product_count) || 0), 0);
  const totalCountries = countries.length;

  return (
    <div className="space-y-5">
      {/* Compact Hero Section */}
      <section className="relative overflow-hidden rounded-2xl gradient-animated px-5 py-5">
        <div className="hero-shape-1 !w-48 !h-48" />
        <div className="hero-shape-2 !w-56 !h-56" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-cream-200 mb-3 text-xs">
              <Sparkles className="w-3 h-3 text-saffron-500" />
              <span className="font-medium text-charcoal-700">
                Live prices from {totalCountries} countries
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-display font-bold text-charcoal-900 leading-tight">
              Discover Where{' '}
              <span className="text-gradient-warm">Life Costs Less</span>
            </h1>

            <p className="mt-1.5 text-sm text-charcoal-600 max-w-lg">
              Compare grocery prices across borders and find the best deals.
            </p>
          </div>

          {/* Quick stats - horizontal */}
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white/80 border border-cream-200 flex items-center justify-center">
                <Globe2 className="w-4 h-4 text-terracotta-500" />
              </div>
              <div>
                <p className="text-lg font-display font-bold text-charcoal-900 leading-none">{totalCountries}</p>
                <p className="text-xs text-charcoal-500">Countries</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white/80 border border-cream-200 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-olive-600" />
              </div>
              <div>
                <p className="text-lg font-display font-bold text-charcoal-900 leading-none">{totalProducts.toLocaleString()}</p>
                <p className="text-xs text-charcoal-500">Products</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Country Selector - Compact */}
      <section className="card !p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h2 className="text-sm font-display font-semibold text-charcoal-900">
            Select Countries
          </h2>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cream-100 border border-cream-200 text-xs">
            <span className="text-charcoal-600">Comparing</span>
            <span className="w-5 h-5 rounded-full bg-terracotta-500 text-white flex items-center justify-center text-xs font-bold">
              {selectedCountries.length}
            </span>
          </div>
        </div>
        <CountrySelector
          countries={countries}
          selectedCodes={selectedCountries}
          onToggle={toggleCountry}
        />
      </section>

      {/* Country Stats - Compact Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card !p-4">
              <div className="flex gap-3">
                <div className="skeleton h-12 w-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-24" />
                  <div className="skeleton h-3 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {selectedStats.map((stats) => (
            <CountryCard key={stats.country_id} stats={stats} />
          ))}
        </div>
      )}

      {/* Price Comparison Section - Compact */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h2 className="text-lg font-display font-bold text-charcoal-900">
            Price Comparison
          </h2>

          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-charcoal-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input !py-2 !text-sm pl-9 sm:w-56"
              />
            </div>

            <button
              onClick={() => refetchComparison()}
              className="btn-secondary !py-2 !px-3"
              disabled={comparisonLoading}
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${comparisonLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <ComparisonTable
          products={filteredProducts}
          selectedCountries={selectedCountries}
          loading={comparisonLoading}
        />

        {comparisonData && (
          <p className="text-xs text-charcoal-500 text-center">
            Showing <span className="font-semibold">{filteredProducts.length}</span> of{' '}
            <span className="font-semibold">{comparisonData.total}</span> products
          </p>
        )}
      </section>
    </div>
  );
}
