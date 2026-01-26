import { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Search, Store, Package, ExternalLink } from 'lucide-react';
import { countriesApi, supermarketsApi, canonicalApi } from '../services/api';
import { formatPrice } from '../utils/currency';
import { formatRelativeTime } from '../utils/dateFormat';
import type { Country, Supermarket, Product } from '../types';
import { useSEO, generateCountrySchema, generateBreadcrumbSchema } from '../hooks/useSEO';

const PRODUCTS_PER_PAGE = 100;

export default function CountryProducts() {
  const { t } = useTranslation();
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

  // Generate SEO structured data for the country page
  const structuredData = useMemo(() => {
    if (!country) return undefined;
    return {
      ...generateCountrySchema({
        name: country.name,
        code: country.code,
        productCount: totalProducts,
      }),
      ...generateBreadcrumbSchema([
        { name: 'Home', url: 'https://whereislifecheaper.com/' },
        { name: country.name, url: `https://whereislifecheaper.com/country/${country.code.toLowerCase()}` },
      ]),
    };
  }, [country, totalProducts]);

  // Set SEO meta tags for country page
  useSEO({
    title: country ? `Grocery Prices in ${country.name}` : 'Country Not Found',
    description: country
      ? `Browse ${totalProducts.toLocaleString()} grocery products and supermarket prices in ${country.name}. Compare prices, find deals, and track price changes.`
      : 'The requested country was not found.',
    keywords: country
      ? `${country.name} grocery prices, ${country.name} supermarket, ${country.name} food prices, ${country.name} cost of living, shopping in ${country.name}`
      : undefined,
    canonicalUrl: country
      ? `https://whereislifecheaper.com/country/${country.code.toLowerCase()}`
      : undefined,
    structuredData,
    noIndex: !country, // Don't index 404 pages
  });

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
        <h2 className="text-xl font-display font-bold text-charcoal-900">{t('countryProducts.countryNotFound')}</h2>
        <Link to="/" className="btn-primary">
          {t('countryProducts.backToHome')}
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
          <span>{t('countryProducts.backToComparison')}</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-5xl">{country.flag_emoji}</span>
          <div>
            <h1 className="text-3xl font-display font-bold text-charcoal-900">{country.name}</h1>
            <p className="text-charcoal-600">
              {t('countryCard.productsAvailable', { count: totalProducts })}
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
              placeholder={t('countryProducts.searchProducts')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          {/* Supermarket filter */}
          {supermarkets && supermarkets.filter((s: Supermarket) => s.is_active).length > 1 && (
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
                  <option value="">{t('countryProducts.allSupermarkets')}</option>
                  {supermarkets.filter((s: Supermarket) => s.is_active).map((s: Supermarket) => (
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
          <h3 className="text-lg font-display font-bold text-charcoal-900 mb-2">{t('countryProducts.noProductsFound')}</h3>
          <p className="text-charcoal-600">
            {search ? t('countryProducts.tryAdjusting') : t('countryProducts.noProductsAvailable')}
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
                <div className="flex items-end justify-between gap-2 mt-auto pt-2 border-t border-cream-200">
                  <div className="shrink-0">
                    {product.price ? (
                      <p className="text-lg font-bold text-terracotta-600">
                        {formatPrice(product.price, product.currency || country.currency_code)}
                      </p>
                    ) : (
                      <p className="text-sm text-charcoal-400">{t('countryProducts.priceUnavailable')}</p>
                    )}
                    {product.unit && product.unit_quantity && (
                      <p className="text-xs text-charcoal-500">
                        {product.unit_quantity} {product.unit}
                      </p>
                    )}
                    {product.price_updated_at && (
                      <p className="text-[10px] text-charcoal-400 mt-0.5">
                        {t('common.updated')} {formatRelativeTime(product.price_updated_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="badge-olive text-xs truncate" title={product.supermarket_name}>
                      {product.supermarket_name}
                    </span>
                    {product.product_url && (
                      <a
                        href={product.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-1 text-charcoal-400 hover:text-terracotta-600 transition-colors"
                        title={t('countryProducts.viewOnSupermarket')}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="flex justify-center items-center gap-2 mt-8" aria-label={t('common.pagination')}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('common.goToPreviousPage')}
              >
                {t('common.previous')}
              </button>
              <span className="px-4 text-charcoal-600" aria-live="polite" aria-atomic="true">
                {t('common.page')} {page + 1} {t('common.of')} {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('common.goToNextPage')}
              >
                {t('common.next')}
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
