import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Link2, Unlink, Plus, Trash2, Package } from 'lucide-react';
import { countriesApi, canonicalApi } from '../../services/api';
import Loading from '../../components/common/Loading';
import type { Product, Country, CanonicalProductBasic } from '../../types';

export default function Mapping() {
  const queryClient = useQueryClient();
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [canonicalSearch, setCanonicalSearch] = useState('');
  const [newCanonicalName, setNewCanonicalName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Fetch countries
  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: countriesApi.getAll,
  });

  // Fetch products by country
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', selectedCountryId, productSearch],
    queryFn: () =>
      selectedCountryId
        ? canonicalApi.getProductsByCountry(selectedCountryId, {
            search: productSearch || undefined,
            limit: 100,
          })
        : Promise.resolve({ data: [], count: 0 }),
    enabled: !!selectedCountryId,
  });

  // Fetch canonical products
  const { data: canonicalProducts = [], isLoading: canonicalLoading } = useQuery({
    queryKey: ['canonical', canonicalSearch],
    queryFn: () => canonicalApi.getAll(canonicalSearch || undefined),
  });

  // Create canonical product mutation
  const createMutation = useMutation({
    mutationFn: (name: string) => canonicalApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canonical'] });
      setNewCanonicalName('');
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
      setSelectedProduct(null);
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
    if (newCanonicalName.trim()) {
      createMutation.mutate(newCanonicalName.trim());
    }
  };

  const handleLinkProduct = (canonicalId: number) => {
    if (selectedProduct) {
      linkMutation.mutate({ productId: selectedProduct.id, canonicalId });
    }
  };

  const handleUnlinkProduct = (product: Product) => {
    linkMutation.mutate({ productId: product.id, canonicalId: null });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Product Mapping</h1>
        <p className="text-slate-600 mt-1">
          Link products from different countries to canonical products for
          comparison.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Products */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Products by Country
          </h2>

          {/* Country selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Country
            </label>
            <select
              value={selectedCountryId || ''}
              onChange={(e) => setSelectedCountryId(Number(e.target.value) || null)}
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
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="input pl-10"
              />
            </div>
          )}

          {/* Products list */}
          <div className="max-h-[500px] overflow-y-auto space-y-2">
            {productsLoading ? (
              <Loading text="Loading products..." />
            ) : !selectedCountryId ? (
              <p className="text-slate-500 text-center py-8">
                Select a country to see products
              </p>
            ) : productsData?.data.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No products found</p>
            ) : (
              productsData?.data.map((product: Product) => (
                <div
                  key={product.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedProduct?.id === product.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="flex items-start gap-3">
                    {/* Product Image */}
                    <div className="flex-shrink-0 w-16 h-16 bg-slate-100 rounded-lg overflow-hidden">
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
                          <Package className="h-6 w-6" />
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        {product.name}
                      </p>
                      <p className="text-sm text-slate-500">
                        {product.brand || 'No brand'} • {product.supermarket_name}
                      </p>
                      {product.price != null && (
                        <p className="text-sm font-medium text-green-600">
                          {product.currency} {Number(product.price).toFixed(2)}
                        </p>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="flex-shrink-0">
                      {product.canonical_product_id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                            {product.canonical_product_name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnlinkProduct(product);
                            }}
                            className="p-1 text-slate-400 hover:text-red-500"
                            title="Unlink"
                          >
                            <Unlink className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs px-2 py-1 bg-slate-100 text-slate-500 rounded-full">
                          Not linked
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Canonical Products */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Canonical Products
          </h2>

          {/* Create new canonical product */}
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              placeholder="New canonical product name..."
              value={newCanonicalName}
              onChange={(e) => setNewCanonicalName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCanonical()}
              className="input flex-1"
            />
            <button
              onClick={handleCreateCanonical}
              disabled={!newCanonicalName.trim() || createMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          {/* Search canonical products */}
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

          {/* Selected product info */}
          {selectedProduct && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Linking:</strong> {selectedProduct.name}
              </p>
              <p className="text-xs text-blue-600">
                Click a canonical product below to link
              </p>
            </div>
          )}

          {/* Canonical products list */}
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {canonicalLoading ? (
              <Loading text="Loading canonical products..." />
            ) : canonicalProducts.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                No canonical products yet. Create one above.
              </p>
            ) : (
              canonicalProducts.map((cp: CanonicalProductBasic) => (
                <div
                  key={cp.id}
                  className="p-3 rounded-lg border border-slate-200 hover:border-slate-300 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-900">{cp.name}</p>
                    <p className="text-xs text-slate-500">
                      {cp.linked_products_count || 0} products •{' '}
                      {cp.countries_count || 0} countries
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedProduct && (
                      <button
                        onClick={() => handleLinkProduct(cp.id)}
                        disabled={linkMutation.isPending}
                        className="btn-primary py-1 px-3 text-sm flex items-center gap-1"
                      >
                        <Link2 className="h-3 w-3" />
                        Link
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${cp.name}"? This will unlink all associated products.`
                          )
                        ) {
                          deleteMutation.mutate(cp.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="p-1 text-slate-400 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
