import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Package, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Trash2, Settings } from 'lucide-react';
import { countriesApi, canonicalApi } from '../../services/api';
import Loading from '../../components/common/Loading';
import type { Product, Country, CanonicalProductBasic } from '../../types';

const PRODUCTS_PER_PAGE = 50;

export default function Mapping() {
  const queryClient = useQueryClient();
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(0);
  const [showManageSection, setShowManageSection] = useState(false);
  const [canonicalSearch, setCanonicalSearch] = useState('');
  const [dropdownSearch, setDropdownSearch] = useState<{ [key: number]: string }>({});
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  // Fetch countries
  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: countriesApi.getAll,
  });

  // Fetch products by country with pagination
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', selectedCountryId, productSearch, productPage],
    queryFn: () =>
      selectedCountryId
        ? canonicalApi.getProductsByCountry(selectedCountryId, {
            search: productSearch || undefined,
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
    setSelectedCountryId(countryId);
    setProductPage(0);
    setOpenDropdown(null);
  };

  const handleProductSearch = (search: string) => {
    setProductSearch(search);
    setProductPage(0);
  };

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
    if (confirm(`Delete "${cp.name}"? This will unlink all associated products.`)) {
      deleteMutation.mutate(cp.id);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Product Mapping</h1>
        <p className="text-slate-600 mt-1">
          Map products to canonical products for cross-country comparison.
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
              Manage Canonical Products
            </span>
            <span className="text-sm text-slate-500">
              ({canonicalProducts.length} total)
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
                placeholder="Search canonical products..."
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
                    No canonical products found
                    {canonicalSearch && (
                      <span className="font-medium text-slate-700"> matching "{canonicalSearch}"</span>
                    )}
                  </p>
                  {canonicalSearch.trim() && (
                    <button
                      onClick={handleCreateCanonical}
                      disabled={createMutation.isPending}
                      className="btn-primary inline-flex items-center gap-1.5 text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Create "{canonicalSearch}"
                    </button>
                  )}
                </div>
              ) : (
                filteredCanonicalForManage.map((cp: CanonicalProductBasic) => (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300"
                  >
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{cp.name}</p>
                      <p className="text-xs text-slate-500">
                        {cp.linked_products_count || 0} products • {cp.countries_count || 0} countries
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteCanonical(cp)}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Delete canonical product"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
          Products by Country
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
              <option value="">Choose a country...</option>
              {countries.map((country: Country) => (
                <option key={country.id} value={country.id}>
                  {country.flag_emoji} {country.name} ({country.code})
                </option>
              ))}
            </select>
          </div>

          {/* Product search */}
          {selectedCountryId && (
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => handleProductSearch(e.target.value)}
                className="input pl-10"
              />
            </div>
          )}
        </div>

        {/* Products Table */}
        <div className="overflow-x-auto">
          {productsLoading ? (
            <Loading text="Loading products..." />
          ) : !selectedCountryId ? (
            <p className="text-slate-500 text-center py-12">
              Select a country to see products
            </p>
          ) : productsData?.data.length === 0 ? (
            <p className="text-slate-500 text-center py-12">No products found</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600 w-16">
                    Image
                  </th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                    Product
                  </th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600 w-32">
                    Price
                  </th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-600 w-72">
                    Canonical Product
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
              Showing {productPage * PRODUCTS_PER_PAGE + 1}-
              {Math.min((productPage + 1) * PRODUCTS_PER_PAGE, productsData.count)} of{' '}
              {productsData.count} products
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setProductPage((p) => Math.max(0, p - 1))}
                disabled={productPage === 0}
                className="btn-secondary py-1 px-2 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-slate-600">
                Page {productPage + 1} of {Math.ceil(productsData.count / PRODUCTS_PER_PAGE)}
              </span>
              <button
                onClick={() => setProductPage((p) => p + 1)}
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
          {product.brand || 'No brand'} • {product.supermarket_name}
          {product.unit && (
            <> • {product.unit_quantity && product.unit_quantity !== 1 ? `${product.unit_quantity} ` : ''}{product.unit}</>
          )}
        </p>
      </td>

      {/* Price */}
      <td className="py-2 px-2">
        {product.price != null ? (
          <span className="text-sm font-medium text-green-600">
            {product.currency} {Number(product.price).toFixed(2)}
          </span>
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
              {currentCanonical ? currentCanonical.name : 'Select canonical product...'}
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
                      placeholder="Search..."
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
                      Remove mapping
                    </button>
                  )}

                  {/* Canonical Products */}
                  {filteredCanonical.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-slate-500 text-center">
                      No matching products
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
