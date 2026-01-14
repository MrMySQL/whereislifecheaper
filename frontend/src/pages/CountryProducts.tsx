import { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search, Store, Package } from 'lucide-react';
import { countriesApi, supermarketsApi, canonicalApi } from '../services/api';
import { formatPrice } from '../utils/currency';
import type { Country, Supermarket, Product } from '../types';

const PRODUCTS_PER_PAGE = 100;

export default function CountryProducts() {
  const { code } = useParams<{ code: string }>();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSupermarket, setSelectedSupermarket] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Find country by code
  const { data: countries } = useQuery({
    queryKey: ['countries'],
    queryFn: countriesApi.getAll,
  });

  const country = useMemo(() => {
    return countries?.find((c: Country) => c.code.toLowerCase() === code?.toLowerCase());
  }, [countries, code]);

  // Fetch supermarkets for this country
  const { data: supermarkets } = useQuery({
    queryKey: ['supermarkets', country?.id],
    queryFn: () => supermarketsApi.getByCountry(country!.id),
    enabled: !!country?.id,
  });

  // Fetch products for this country (with backend filtering)
  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['countryProducts', country?.id, debouncedSearch, selectedSupermarket, page],
    queryFn: () =>
      canonicalApi.getProductsByCountry(country!.id, {
        search: debouncedSearch || undefined,
        supermarket_id: selectedSupermarket || undefined,
        limit: PRODUCTS_PER_PAGE,
        offset: page * PRODUCTS_PER_PAGE,
      }),
    enabled: !!country?.id,
  });

  const products = productsData?.data || [];

  const totalProducts = productsData?.count || 0;
  const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);

  if (!countries) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-terracotta-500"></div>
      </div>
    );
  }

  if (!country) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Package className="h-16 w-16 text-charcoal-300" />
        <h2 className="text-xl font-display font-bold text-charcoal-900">Country not found</h2>
        <Link to="/" className="btn-primary">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-charcoal-600 hover:text-terracotta-600 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to comparison</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-5xl">{country.flag_emoji}</span>
          <div>
            <h1 className="text-3xl font-display font-bold text-charcoal-900">{country.name}</h1>
            <p className="text-charcoal-600">
              {totalProducts.toLocaleString()} products available
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card !p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-charcoal-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          {/* Supermarket filter */}
          {supermarkets && supermarkets.length > 1 && (
            <div className="sm:w-64">
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-charcoal-400" />
                <select
                  value={selectedSupermarket || ''}
                  onChange={(e) => {
                    setSelectedSupermarket(e.target.value ? Number(e.target.value) : null);
                    setPage(0);
                  }}
                  className="input pl-10 w-full appearance-none cursor-pointer"
                >
                  <option value="">All supermarkets</option>
                  {supermarkets.map((s: Supermarket) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Products Grid */}
      {isLoadingProducts ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card !p-4 animate-pulse">
              <div className="w-full h-32 bg-cream-200 rounded-lg mb-3" />
              <div className="h-4 bg-cream-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-cream-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="card !p-12 text-center">
          <Package className="h-16 w-16 text-charcoal-300 mx-auto mb-4" />
          <h3 className="text-lg font-display font-bold text-charcoal-900 mb-2">No products found</h3>
          <p className="text-charcoal-600">
            {search ? 'Try adjusting your search terms' : 'No products available for this country'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((product: Product) => (
              <div key={`${product.id}-${product.supermarket_id}`} className="card !p-4 hover:shadow-md transition-shadow">
                {/* Product Image */}
                <div className="w-full h-32 bg-cream-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Package className="h-12 w-12 text-charcoal-300" />
                  )}
                </div>

                {/* Product Info */}
                <h3 className="font-medium text-charcoal-900 text-sm line-clamp-2 mb-1" title={product.name}>
                  {product.name}
                </h3>
                {product.brand && (
                  <p className="text-xs text-charcoal-500 mb-2">{product.brand}</p>
                )}

                {/* Price and Supermarket */}
                <div className="flex items-end justify-between mt-auto pt-2 border-t border-cream-200">
                  <div>
                    {product.price ? (
                      <p className="text-lg font-bold text-terracotta-600">
                        {formatPrice(product.price, product.currency || country.currency_code)}
                      </p>
                    ) : (
                      <p className="text-sm text-charcoal-400">Price unavailable</p>
                    )}
                    {product.unit && product.unit_quantity && (
                      <p className="text-xs text-charcoal-500">
                        {product.unit_quantity} {product.unit}
                      </p>
                    )}
                  </div>
                  <span className="badge-olive text-xs">{product.supermarket_name}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-4 text-charcoal-600">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
