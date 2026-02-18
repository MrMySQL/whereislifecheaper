import { productRepository, priceRepository } from '../repositories';
import { ProductData } from '../types/scraper.types';
import { normalizeProductName } from '../utils/normalizer';
import { scraperLogger } from '../utils/logger';

export class ProductService {
  // ── Private helpers (business logic — not DB queries) ────────────────────

  private buildNameBrandKey(normalizedName: string, brand?: string | null): string {
    return `${normalizedName}::${brand ?? ''}`;
  }

  private normalizeExternalId(externalId?: string): string | undefined {
    if (!externalId) return undefined;
    const trimmed = externalId.trim();
    if (!trimmed) return undefined;
    try {
      return decodeURIComponent(trimmed).normalize('NFC').toLowerCase();
    } catch {
      return trimmed.normalize('NFC').toLowerCase();
    }
  }

  private normalizeProductUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;
    try {
      const parsed = new URL(trimmed);
      parsed.hash = '';
      parsed.search = '';
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
      return parsed.toString();
    } catch {
      return trimmed.replace(/\/+$/, '') || trimmed;
    }
  }

  private extractExternalId(url: string): string | undefined {
    const patterns = [
      /-p-([a-zA-Z0-9]+)/i,
      /\/proizvod\/([a-zA-Z0-9_-]+)/i,
      /\/product\/([^/?#]+)(?:[/?#]|$)/i,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return this.normalizeExternalId(match[1]);
    }
    return undefined;
  }

  // ── Public methods ────────────────────────────────────────────────────────

  async findOrCreateProduct(
    productData: ProductData,
    supermarketId: string,
    categoryId?: string
  ): Promise<string> {
    const normalizedName = normalizeProductName(productData.name);
    const productUrl = this.normalizeProductUrl(productData.productUrl);
    const externalId = this.normalizeExternalId(
      productData.externalId || this.extractExternalId(productUrl)
    );

    try {
      let productId: string | null = null;
      let existingMappingId: string | null = null;

      if (externalId) {
        const existingMapping = await productRepository.findMappingByExternalId(supermarketId, externalId);
        if (existingMapping) {
          productId = existingMapping.product_id;
          existingMappingId = existingMapping.id;
          await productRepository.updateProduct(productId, {
            name: productData.name,
            normalizedName,
            imageUrl: productData.imageUrl,
            unit: productData.unit,
            unitQuantity: productData.unitQuantity,
          });
        }
      }

      if (!productId) {
        const existingMappingByUrl = await productRepository.findMappingByUrl(supermarketId, productUrl);
        if (existingMappingByUrl) {
          productId = existingMappingByUrl.product_id;
          existingMappingId = existingMappingByUrl.id;
          await productRepository.updateMappingById(existingMappingId, { productUrl, externalId });
          await productRepository.updateProduct(productId, {
            name: productData.name,
            normalizedName,
            imageUrl: productData.imageUrl,
            unit: productData.unit,
            unitQuantity: productData.unitQuantity,
          });
        }
      }

      if (!productId && !externalId) {
        productId = await productRepository.findProductByNameAndBrand(normalizedName, productData.brand);
      }

      if (!productId) {
        productId = await productRepository.createProduct({
          name: productData.name,
          normalizedName,
          brand: productData.brand,
          categoryId,
          unit: productData.unit,
          unitQuantity: productData.unitQuantity,
          imageUrl: productData.imageUrl,
        });
        scraperLogger.debug(`Created new product: ${productData.name} (${productId})`);
      }

      if (existingMappingId) return existingMappingId;

      return productRepository.createOrUpdateMapping(productId, supermarketId, { externalId, productUrl });
    } catch (error) {
      scraperLogger.error('Error in findOrCreateProduct:', error);
      throw error;
    }
  }

  async recordPrice(
    productMappingId: string,
    priceData: {
      price: number;
      currency: string;
      originalPrice?: number;
      isOnSale: boolean;
      pricePerUnit?: number;
    }
  ): Promise<void> {
    return priceRepository.recordPrice(productMappingId, priceData);
  }

  async bulkSaveProducts(
    products: ProductData[],
    supermarketId: string,
    currency: string
  ): Promise<number> {
    if (products.length === 0) return 0;

    const startTime = Date.now();
    scraperLogger.debug(`Bulk saving ${products.length} products...`);

    try {
      // Prepare and normalize
      const preparedProducts = products.map(p => {
        const normalizedUrl = this.normalizeProductUrl(p.productUrl);
        return {
          ...p,
          productUrl: normalizedUrl,
          externalId: this.normalizeExternalId(
            p.externalId || this.extractExternalId(normalizedUrl)
          ),
          normalizedName: normalizeProductName(p.name),
        };
      });

      // Deduplicate within batch
      const seenKeys = new Set<string>();
      const uniqueProducts = preparedProducts.filter(p => {
        const key = p.externalId ? `ext:${p.externalId}` : `url:${p.productUrl}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      if (uniqueProducts.length !== preparedProducts.length) {
        scraperLogger.debug(
          `Deduplicated page batch: ${preparedProducts.length} -> ${uniqueProducts.length}`
        );
      }

      // Batch fetch existing mappings
      const externalIds = uniqueProducts.map(p => p.externalId).filter((id): id is string => !!id);
      const urls = uniqueProducts.map(p => p.productUrl);

      const [byExternalId, byUrl] = await Promise.all([
        productRepository.batchFindMappingsByExternalIds(supermarketId, externalIds),
        productRepository.batchFindMappingsByUrls(supermarketId, urls),
      ]);

      const mappingsByExternalId = new Map(
        byExternalId.filter(m => !!m.external_id).map(m => [m.external_id, m])
      );
      const mappingsByUrl = new Map(byUrl.map(m => [m.url, m]));

      // Separate existing vs new
      const existingProducts: Array<{
        product: typeof uniqueProducts[0];
        mapping: typeof byExternalId[0];
      }> = [];
      const forNameBrandLookup: typeof uniqueProducts = [];
      const newProducts: typeof uniqueProducts = [];

      for (const product of uniqueProducts) {
        if (product.externalId && mappingsByExternalId.has(product.externalId)) {
          existingProducts.push({ product, mapping: mappingsByExternalId.get(product.externalId)! });
          continue;
        }
        if (mappingsByUrl.has(product.productUrl)) {
          existingProducts.push({ product, mapping: mappingsByUrl.get(product.productUrl)! });
          continue;
        }
        if (!product.externalId) {
          forNameBrandLookup.push(product);
        } else {
          newProducts.push(product);
        }
      }

      if (forNameBrandLookup.length > 0) {
        const byNameBrand = await productRepository.batchFindMappingsByNameAndBrand(
          supermarketId,
          forNameBrandLookup
        );
        const mappingsByNameBrand = new Map(
          byNameBrand.map(m => [this.buildNameBrandKey(m.lookup_normalized_name, m.lookup_brand), m])
        );
        for (const product of forNameBrandLookup) {
          const key = this.buildNameBrandKey(product.normalizedName, product.brand);
          const mapping = mappingsByNameBrand.get(key);
          if (mapping) {
            existingProducts.push({ product, mapping });
          } else {
            newProducts.push(product);
          }
        }
      }

      scraperLogger.debug(
        `Found ${existingProducts.length} existing, ${newProducts.length} new products`
      );

      // Batch update existing
      const existingMappingIds: string[] = [];
      if (existingProducts.length > 0) {
        await productRepository.batchUpdateExistingProducts(existingProducts);
        existingMappingIds.push(...existingProducts.map(ep => ep.mapping.id));
      }

      // Batch create new
      const newMappingIds: string[] = [];
      if (newProducts.length > 0) {
        const created = await productRepository.batchCreateProductsAndMappings(newProducts, supermarketId);
        newMappingIds.push(...created);
      }

      // Batch insert prices
      const allMappingIds = [...existingMappingIds, ...newMappingIds];
      const allProducts = [...existingProducts.map(ep => ep.product), ...newProducts];

      if (allMappingIds.length > 0) {
        await priceRepository.batchInsertPrices(allMappingIds, allProducts, currency);
      }

      const duration = Date.now() - startTime;
      scraperLogger.debug(
        `Bulk saved ${allMappingIds.length} products in ${duration}ms ` +
        `(${existingMappingIds.length} updated, ${newMappingIds.length} created)`
      );

      return allMappingIds.length;
    } catch (error) {
      scraperLogger.error('Error in bulkSaveProducts:', error);
      throw error;
    }
  }

  async getProductById(productId: string): Promise<Record<string, unknown> | null> {
    return productRepository.findByIdWithPrices(productId);
  }

  async searchProducts(searchTerm: string, limit: number = 50): Promise<Record<string, unknown>[]> {
    const normalizedSearch = normalizeProductName(searchTerm);
    return productRepository.search(normalizedSearch, limit);
  }

  async getLatestPricesBySupermarket(supermarketId: string): Promise<Record<string, unknown>[]> {
    return productRepository.getLatestPricesBySupermarket(supermarketId);
  }

  async cleanupOldPrices(daysToKeep: number = 90): Promise<number> {
    const deletedCount = await priceRepository.cleanupOld(daysToKeep);
    scraperLogger.info(`Cleaned up ${deletedCount} old price records`);
    return deletedCount;
  }
}
