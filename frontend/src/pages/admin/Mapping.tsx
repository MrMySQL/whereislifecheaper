import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Package, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Trash2, Settings, Info, EyeOff, Link } from 'lucide-react';
import { countriesApi, canonicalApi, supermarketsApi } from '../../services/api';
import Loading from '../../components/common/Loading';
import { convertToEUR } from '../../utils/currency';
import { formatFullDate } from '../../utils/dateFormat';
import type { Product, Country, CanonicalProductBasic, Supermarket } from '../../types';

const PRODUCTS_PER_PAGE = 50;

function parsePositiveIntParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function Mapping() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParam = searchParams.get('search') || '';
  const [productSearchInput, setProductSearchInput] = useState(searchParam);
  const [productSearch, setProductSearch] = useState(searchParam);
  const [mappedOnly, setMappedOnly] = useState(false);
  const [showManageSection, setShowManageSection] = useState(false);
  const [canonicalSearch, setCanonicalSearch] = useState('');
  const [dropdownSearch, setDropdownSearch] = useState<{ [key: number]: string }>({});
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const selectedCountryId = parsePositiveIntParam(searchParams.get('country'));
  const selectedSupermarketId = parsePositiveIntParam(searchParams.get('supermarket'));
  const pageParam = parsePositiveIntParam(searchParams.get('page'));
  const productPage = pageParam ? pageParam - 1 : 0;

  const updateUrlParams = useCallback((updater: (params: URLSearchParams) => void) => {
    setSearchParams((prevParams) => {
      const nextParams = new URLSearchParams(prevParams);
      updater(nextParams);
      if (nextParams.toString() === prevParams.toString()) {
        return prevParams;
      }
      return nextParams;
    });
  }, [setSearchParams]);

  const setPageInUrl = useCallback((nextPage: number) => {
    const safePage = Math.max(0, nextPage);
    updateUrlParams((params) => {
      if (safePage === 0) {
        params.delete('page');
      } else {
        params.set('page', String(safePage + 1));
      }
    });
  }, [updateUrlParams]);

  // Debounce product search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (productSearchInput === productSearch) return;
      setProductSearch(productSearchInput);
      updateUrlParams((params) => {
        if (productSearchInput) {
          params.set('search', productSearchInput);
        } else {
          params.delete('search');
        }
        params.delete('page');
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [productSearchInput, productSearch, updateUrlParams]);

  useEffect(() => {
    setProductSearchInput((current) => (current === searchParam ? current : searchParam));
    setProductSearch((current) => (current === searchParam ? current : searchParam));
  }, [searchParam]);

  // Fetch countries
  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: countriesApi.getAll,
  });

  // Fetch supermarkets for selected country
  const { data: supermarkets = [], isFetched: supermarketsFetched } = useQuery({
    queryKey: ['supermarkets', selectedCountryId],
    queryFn: () => supermarketsApi.getByCountry(selectedCountryId!),
    enabled: !!selectedCountryId,
  });

  // Fetch products by country with pagination
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', selectedCountryId, selectedSupermarketId, productSearch, productPage, mappedOnly],
    queryFn: () =>
      selectedCountryId
        ? canonicalApi.getProductsByCountry(selectedCountryId, {
            search: productSearch || undefined,
            supermarket_id: selectedSupermarketId || undefined,
            mapped_only: mappedOnly || undefined,
            limit: PRODUCTS_PER_PAGE,
            offset: productPage * PRODUCTS_PER_PAGE,
          })
        : Promise.resolve({ data: [], count: 0 }),
    enabled: !!selectedCountryId,
    placeholderData: undefined,
  });

  // Fetch all canonical products for dropdowns
  const { data: canonicalProducts = [] } = useQuery({
    queryKey: ['canonical'],
    queryFn: () => canonicalApi.getAll(),
  });

  // Reset page when search or country changes
  const handleCountryChange = (countryId: number | null) => {
    queryClient.cancelQueries({ queryKey: ['products'] });
    updateUrlParams((params) => {
      if (countryId) {
        params.set('country', String(countryId));
      } else {
        params.delete('country');
      }
      params.delete('supermarket');
      params.delete('search');
      params.delete('page');
    });
    setProductSearchInput('');
    setProductSearch('');
    setOpenDropdown(null);
  };

  const handleSupermarketChange = (supermarketId: number | null) => {
    updateUrlParams((params) => {
      if (supermarketId) {
        params.set('supermarket', String(supermarketId));
      } else {
        params.delete('supermarket');
      }
      params.delete('page');
    });
  };

  const handleProductSearch = (search: string) => {
    setProductSearchInput(search);
  };

  const handleMappedOnlyChange = (checked: boolean) => {
    setMappedOnly(checked);
    setPageInUrl(0);
  };

  useEffect(() => {
    if (!selectedCountryId && (searchParams.has('supermarket') || searchParams.has('page'))) {
      updateUrlParams((params) => {
        params.delete('supermarket');
        params.delete('page');
      });
    }
  }, [selectedCountryId, searchParams, updateUrlParams]);

  useEffect(() => {
    if (!selectedCountryId || !selectedSupermarketId || !supermarketsFetched) return;
    const existsInCountry = supermarkets.some((supermarket) => supermarket.id === selectedSupermarketId);
    if (!existsInCountry) {
      updateUrlParams((params) => {
        params.delete('supermarket');
        params.delete('page');
      });
    }
  }, [selectedCountryId, selectedSupermarketId, supermarkets, supermarketsFetched, updateUrlParams]);

  useEffect(() => {
    if (!selectedCountryId || !productsData) return;
    if (productsData.count === 0 && productPage > 0) {
      setPageInUrl(0);
      return;
    }
    const maxPage = Math.max(Math.ceil(productsData.count / PRODUCTS_PER_PAGE) - 1, 0);
    if (productPage > maxPage) {
      setPageInUrl(maxPage);
    }
  }, [selectedCountryId, productsData, productPage, setPageInUrl]);

  // Create canonical product mutation
  const createMutation = useMutation({
    mutationFn: (name: string) => canonicalApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canonical'] });
      setCanonicalSearch('');
    },
  });

  // Link product mutation
  const linkMutation = useMutation({
    mutationFn: ({
      productId,
      canonicalId,
    }: {
      productId: number;
      canonicalId: number | null;
    }) => canonicalApi.link(productId, canonicalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['canonical'] });
      setOpenDropdown(null);
    },
  });

  // Delete canonical product mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => canonicalApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canonical'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  // Update canonical product mutation (for show_per_unit_price and disabled toggles)
  const updateMutation = useMutation({
    mutationFn: ({ id, show_per_unit_price, disabled }: { id: number; show_per_unit_price?: boolean; disabled?: boolean }) =>
      canonicalApi.update(id, { show_per_unit_price, disabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canonical'] });
    },
  });

  const handleCreateCanonical = () => {
    const name = canonicalSearch.trim();
    if (name) {
      createMutation.mutate(name);
    }
  };

  const handleLinkProduct = (productId: number, canonicalId: number | null) => {
    linkMutation.mutate({ productId, canonicalId });
  };

  // Filter canonical products based on dropdown search
  const getFilteredCanonical = (productId: number) => {
    const search = dropdownSearch[productId]?.toLowerCase() || '';
    if (!search) return canonicalProducts;
    return canonicalProducts.filter((cp: CanonicalProductBasic) =>
      cp.name.toLowerCase().includes(search)
    );
  };

  // Filter canonical products for manage section
  const filteredCanonicalForManage = useMemo(() => {
    if (!canonicalSearch) return canonicalProducts;
    return canonicalProducts.filter((cp: CanonicalProductBasic) =>
      cp.name.toLowerCase().includes(canonicalSearch.toLowerCase())
    );
  }, [canonicalProducts, canonicalSearch]);

  const handleDeleteCanonical = (cp: CanonicalProductBasic) => {
    if (confirm(t('mapping.deleteConfirm', { name: cp.name }))) {
      deleteMutation.mutate(cp.id);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('mapping.productMapping')}</h1>
        <p className="text-slate-600 mt-1">
          {t('mapping.mapDescription')}
        </p>
      </div>

      {/* Collapsible Manage Canonical Products Section */}
      <div className="card">
        <button
          onClick={() => setShowManageSection(!showManageSection)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-500" />
            <span className="font-medium text-slate-700">
              {t('mapping.manageCanonical')}
            </span>
            <span className="text-sm text-slate-500">
              ({canonicalProducts.length} {t('mapping.total')})
            </span>
          </div>
          {showManageSection ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </button>
        {showManageSection && (
          <div className="mt-4">
            {/* Search */}
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={t('mapping.searchCanonical')}
                value={canonicalSearch}
                onChange={(e) => setCanonicalSearch(e.target.value)}
                className="input pl-10"
              />
            </div>

            {/* Canonical Products List */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {filteredCanonicalForManage.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-slate-500 mb-3">
                    {t('mapping.noCanonicalFound')}
                    {canonicalSearch && (
                      <span className="font-medium text-slate-700"> {t('mapping.matching')} "{canonicalSearch}"</span>
                    )}
                  </p>
                  {canonicalSearch.trim() && (
                    <button
                      onClick={handleCreateCanonical}
                      disabled={createMutation.isPending}
                      className="btn-primary inline-flex items-center gap-1.5 text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      {t('common.create')} "{canonicalSearch}"
                    </button>
                  )}
                </div>
              ) : (
                filteredCanonicalForManage.map((cp: CanonicalProductBasic) => (
                  <div
                    key={cp.id}
                    className={`flex items-center justify-between p-3 rounded-lg border hover:border-slate-300 ${
                      cp.disabled
                        ? 'border-orange-200 bg-orange-50/50'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className={cp.disabled ? 'opacity-60' : ''}>
                      <p className={`font-medium text-sm ${cp.disabled ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{cp.name}</p>
                      <p className="text-xs text-slate-500">
                        {t('mapping.productsCount', { count: cp.linked_products_count || 0 })} • {t('mapping.countriesCount', { count: cp.countries_count || 0 })}
                        {cp.disabled && <span className="ml-2 text-orange-600">({t('mapping.hiddenFromComparison')})</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Disabled toggle */}
                      <div className="flex items-center gap-1.5">
                        <div className="relative group">
                          <EyeOff className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                          <div className="absolute bottom-full right-0 mb-2 w-56 p-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            {t('mapping.disabledTooltip')}
                            <div className="absolute bottom-0 right-3 translate-y-1/2 rotate-45 w-2 h-2 bg-slate-900" />
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={cp.disabled}
                            onChange={(e) => {
                              updateMutation.mutate({
                                id: cp.id,
                                disabled: e.target.checked,
                              });
                            }}
                            disabled={updateMutation.isPending}
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                        </label>
                      </div>
                      {/* Per-unit price toggle */}
                      <div className="flex items-center gap-1.5">
                        <div className="relative group">
                          <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                          <div className="absolute bottom-full right-0 mb-2 w-64 p-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            {t('mapping.perUnitTooltip')}
                            <div className="absolute bottom-0 right-3 translate-y-1/2 rotate-45 w-2 h-2 bg-slate-900" />
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={cp.show_per_unit_price}
                            onChange={(e) => {
                              updateMutation.mutate({
                                id: cp.id,
                                show_per_unit_price: e.target.checked,
                              });
                            }}
                            disabled={updateMutation.isPending}
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                          <span className="ms-1.5 text-xs text-slate-500">/kg</span>
                        </label>
                      </div>
                      <button
                        onClick={() => handleDeleteCanonical(cp)}
                        disabled={deleteMutation.isPending}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title={t('mapping.deleteCanonical')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Products Section - Full Width */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          {t('mapping.productsByCountry')}
        </h2>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          {/* Country selector */}
          <div className="sm:w-64">
            <select
              value={selectedCountryId || ''}
              onChange={(e) => handleCountryChange(Number(e.target.value) || null)}
              className="input"
            >
              <option value="">{t('mapping.chooseCountry')}</option>
              {countries.map((country: Country) => (
                <option key={country.id} value={country.id}>
                  {country.flag_emoji} {country.name} ({country.code})
                </option>
              ))}
            </select>
          </div>

          {/* Supermarket selector */}
          {selectedCountryId && supermarkets.length > 0 && (
            <div className="sm:w-64">
              <select
                value={selectedSupermarketId || ''}
                onChange={(e) => handleSupermarketChange(Number(e.target.value) || null)}
                className="input"
              >
                <option value="">{t('countryProducts.allSupermarkets')}</option>
                {supermarkets.map((s: Supermarket) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Product search */}
          {selectedCountryId && (
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={t('countryProducts.searchProducts')}
                value={productSearchInput}
                onChange={(e) => handleProductSearch(e.target.value)}
                className="input pl-10"
              />
            </div>
          )}

          {/* Mapped only filter */}
          {selectedCountryId && (
            <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={mappedOnly}
                onChange={(e) => handleMappedOnlyChange(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <Link className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-600">{t('mapping.mappedOnly')}</span>
            </label>
          )}
        </div>

        {/* Products Table */}
        <div>
          {productsLoading ? (
            <Loading text={t('loading.loadingProducts')} />
          ) : !selectedCountryId ? (
            <p className="text-slate-500 text-center py-12">
              {t('mapping.selectCountry')}
            </p>
          ) : productsData?.data.length === 0 ? (
            <p className="text-slate-500 text-center py-12">{t('countryProducts.noProductsFound')}</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600 w-16">
                    {t('mapping.image')}
                  </th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                    {t('comparison.product')}
                  </th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600 w-32">
                    {t('common.price')}
                  </th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600 w-72">
                    {t('mapping.canonicalProduct')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {productsData?.data.map((product: Product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    canonicalProducts={canonicalProducts}
                    filteredCanonical={getFilteredCanonical(product.id)}
                    isOpen={openDropdown === product.id}
                    onToggle={() => setOpenDropdown(openDropdown === product.id ? null : product.id)}
                    onClose={() => setOpenDropdown(null)}
                    searchValue={dropdownSearch[product.id] || ''}
                    onSearchChange={(value) =>
                      setDropdownSearch((prev) => ({ ...prev, [product.id]: value }))
                    }
                    onLink={(canonicalId) => handleLinkProduct(product.id, canonicalId)}
                    isLinking={linkMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {selectedCountryId && productsData && productsData.count > PRODUCTS_PER_PAGE && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
            <p className="text-sm text-slate-500">
              {t('common.showing')} {productPage * PRODUCTS_PER_PAGE + 1}-
              {Math.min((productPage + 1) * PRODUCTS_PER_PAGE, productsData.count)} {t('common.of')}{' '}
              {productsData.count} {t('common.products').toLowerCase()}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPageInUrl(Math.max(0, productPage - 1))}
                disabled={productPage === 0}
                className="btn-secondary py-1 px-2 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-slate-600">
                {t('common.page')} {productPage + 1} {t('common.of')} {Math.ceil(productsData.count / PRODUCTS_PER_PAGE)}
              </span>
              <button
                onClick={() => setPageInUrl(productPage + 1)}
                disabled={(productPage + 1) * PRODUCTS_PER_PAGE >= productsData.count}
                className="btn-secondary py-1 px-2 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Separate component for product row to handle dropdown state
function ProductRow({
  product,
  canonicalProducts,
  filteredCanonical,
  isOpen,
  onToggle,
  onClose,
  searchValue,
  onSearchChange,
  onLink,
  isLinking,
}: {
  product: Product;
  canonicalProducts: CanonicalProductBasic[];
  filteredCanonical: CanonicalProductBasic[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onLink: (canonicalId: number | null) => void;
  isLinking: boolean;
}) {
  const { t } = useTranslation();
  const currentCanonical = useMemo(() => {
    if (!product.canonical_product_id) return null;
    return canonicalProducts.find((cp) => cp.id === product.canonical_product_id);
  }, [product.canonical_product_id, canonicalProducts]);

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      {/* Image */}
      <td className="py-2 px-2">
        <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <Package className="h-5 w-5" />
            </div>
          )}
        </div>
      </td>

      {/* Product Info */}
      <td className="py-2 px-2">
        <p className="font-medium text-slate-900 text-sm">{product.name}</p>
        <p className="text-xs text-slate-500">
          {product.brand || t('mapping.noBrand')} • {product.supermarket_name}
          {product.unit && (
            <> • {product.unit_quantity && product.unit_quantity !== 1 ? `${product.unit_quantity} ` : ''}{product.unit}</>
          )}
        </p>
        {product.created_at && (
          <p className="text-xs text-slate-500">
            {t('mapping.createdAt')} {formatFullDate(product.created_at)}
          </p>
        )}
      </td>

      {/* Price */}
      <td className="py-2 px-2">
        {product.price != null ? (
          <div>
            <span className="text-sm font-medium text-green-600">
              {product.currency} {Number(product.price).toFixed(2)}
            </span>
            {product.currency && (
              <span className="block text-xs text-slate-400">
                €{convertToEUR(Number(product.price), product.currency).toFixed(2)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        )}
      </td>

      {/* Canonical Product Dropdown */}
      <td className="py-2 px-2">
        <div className="relative">
          <button
            onClick={onToggle}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-colors ${
              currentCanonical
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            <span className="truncate">
              {currentCanonical ? currentCanonical.name : t('mapping.selectCanonicalProduct')}
            </span>
            <ChevronDown className="h-4 w-4 flex-shrink-0" />
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={onClose}
              />

              {/* Dropdown Content */}
              <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-64 flex flex-col">
                {/* Search Input */}
                <div className="p-2 border-b border-slate-100">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder={t('common.search')}
                      value={searchValue}
                      onChange={(e) => onSearchChange(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Options List */}
                <div className="overflow-y-auto flex-1">
                  {/* Unlink Option */}
                  {currentCanonical && (
                    <button
                      onClick={() => onLink(null)}
                      disabled={isLinking}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <X className="h-4 w-4" />
                      {t('mapping.removeMapping')}
                    </button>
                  )}

                  {/* Canonical Products */}
                  {filteredCanonical.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-slate-500 text-center">
                      {t('mapping.noMatchingProducts')}
                    </p>
                  ) : (
                    filteredCanonical.map((cp) => (
                      <button
                        key={cp.id}
                        onClick={() => onLink(cp.id)}
                        disabled={isLinking || cp.id === product.canonical_product_id}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 ${
                          cp.id === product.canonical_product_id
                            ? 'bg-green-50 text-green-700'
                            : 'text-slate-700'
                        }`}
                      >
                        <span className="font-medium">{cp.name}</span>
                        <span className="text-xs text-slate-400 ml-2">
                          ({cp.linked_products_count || 0} products)
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
