import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw } from 'lucide-react';
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

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch countries
  const { data: countries = [], isLoading: countriesLoading } = useQuery({
    queryKey: ['countries'],
    queryFn: countriesApi.getAll,
  });

  // Fetch price stats
  const { data: priceStats = [], isLoading: statsLoading } = useQuery({
    queryKey: ['priceStats'],
    queryFn: pricesApi.getStats,
  });

  // Fetch comparison data
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
        // Don't allow less than 2 countries
        if (prev.length <= 2) return prev;
        return prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  };

  // Filter stats for selected countries
  const selectedStats = priceStats.filter((s) =>
    selectedCountries.includes(s.country_code)
  );

  // Filter comparison products to show only those with prices in at least 2 selected countries
  const filteredProducts = (comparisonData?.data || []).filter((product) => {
    const availableCountries = Object.keys(product.prices_by_country).filter(
      (code) => selectedCountries.includes(code)
    );
    return availableCountries.length >= 2;
  });

  if (countriesLoading) {
    return <Loading text="Loading countries..." />;
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Compare Grocery Prices
        </h1>
        <p className="text-slate-600 mt-2">
          See how much groceries cost in different countries and find the best
          deals.
        </p>
      </div>

      {/* Country Selector */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Select Countries to Compare
        </h2>
        <CountrySelector
          countries={countries}
          selectedCodes={selectedCountries}
          onToggle={toggleCountry}
        />
        <p className="text-sm text-slate-500 mt-3">
          Select at least 2 countries to compare prices. Currently comparing{' '}
          <span className="font-medium">{selectedCountries.length}</span>{' '}
          countries.
        </p>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-32 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {selectedStats.map((stats) => (
            <CountryCard key={stats.country_id} stats={stats} />
          ))}
        </div>
      )}

      {/* Search and Comparison Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Price Comparison
          </h2>
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10 sm:w-64"
              />
            </div>
            <button
              onClick={() => refetchComparison()}
              className="btn-secondary flex items-center gap-2"
              disabled={comparisonLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${comparisonLoading ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <ComparisonTable
          products={filteredProducts}
          selectedCountries={selectedCountries}
          loading={comparisonLoading}
        />

        {comparisonData && (
          <p className="text-sm text-slate-500 text-center">
            Showing {filteredProducts.length} of {comparisonData.total} products
            with prices in multiple countries
          </p>
        )}
      </div>
    </div>
  );
}
