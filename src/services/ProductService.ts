import { getClient } from '../config/database';
import { ProductRepository, ProductMappingRepository, PriceRepository } from '../repositories';
import { productRepository as defaultProductRepo, productMappingRepository as defaultMappingRepo, priceRepository as defaultPriceRepo } from '../repositories';
import { QuantityInterpretation } from '../utils/productQuantity';
import { ProductData } from '../types/scraper.types';
import { ProductWithPricesResult, ProductWithCategory, SupermarketProductEntry } from '../types/db.types';
import { normalizeProductName } from '../utils/normalizer';
import { scraperLogger } from '../utils/logger';

/** True when the product carries a name the products table can store. */
function hasName(product: ProductData): boolean {
  return typeof product.name === 'string' && product.name.trim().length > 0;
}

export class ProductService {
  private productRepository: ProductRepository;
  private productMappingRepository: ProductMappingRepository;
  private priceRepository: PriceRepository;

  constructor(
    productRepo?: ProductRepository,
    mappingRepo?: ProductMappingRepository,
    priceRepo?: PriceRepository,
  ) {
    this.productRepository = productRepo ?? defaultProductRepo;
    this.productMappingRepository = mappingRepo ?? defaultMappingRepo;
    this.priceRepository = priceRepo ?? defaultPriceRepo;
  }
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
        const existingMapping = await this.productMappingRepository.findMappingByExternalId(supermarketId, externalId);
        if (existingMapping) {
          productId = existingMapping.product_id;
          existingMappingId = existingMapping.id;
          await this.productMappingRepository.updateProduct(productId, {
            name: productData.name,
            normalizedName,
            imageUrl: productData.imageUrl,
            unit: productData.unit,
            unitQuantity: productData.unitQuantity,
          });
        }
      }

      if (!productId) {
        const existingMappingByUrl = await this.productMappingRepository.findMappingByUrl(supermarketId, productUrl);
        if (existingMappingByUrl) {
          productId = existingMappingByUrl.product_id;
          existingMappingId = existingMappingByUrl.id;
          await this.productMappingRepository.updateMappingById(existingMappingId, { productUrl, externalId });
          await this.productMappingRepository.updateProduct(productId, {
            name: productData.name,
            normalizedName,
            imageUrl: productData.imageUrl,
            unit: productData.unit,
            unitQuantity: productData.unitQuantity,
          });
        }
      }

      if (!productId && !externalId) {
        productId = await this.productMappingRepository.findProductByNameAndBrand(normalizedName, productData.brand);
      }

      if (!productId) {
        productId = await this.productMappingRepository.createProduct({
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

      const mappingId = existingMappingId ?? await this.productMappingRepository.createOrUpdateMapping(
        productId, supermarketId, { externalId, productUrl }
      );
      await this.productMappingRepository.updateMappingById(mappingId, { productUrl, externalId });
      await this.productMappingRepository.recordObservations([mappingId], [productData]);
      return mappingId;
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
      quantityInfo?: QuantityInterpretation;
    }
  ): Promise<void> {
    return this.priceRepository.recordPrice(productMappingId, priceData);
  }

  async bulkSaveProducts(
    products: ProductData[],
    supermarketId: string,
    currency: string
  ): Promise<number> {
    if (products.length === 0) return 0;

    // products.name is NOT NULL. A scraper that hands over a nameless item
    // (Auchan Express, 2026-09-01: four GraphQL items with name = null and
    // nothing but an image URL) used to fail the whole UNNEST batch with
    // 23502 and force the per-product fallback. Drop them here, at the last
    // shared point before the batch insert, so every scraper is covered.
    const named = products.filter(hasName);
    if (named.length < products.length) {
      const dropped = products.filter(p => !hasName(p));
      scraperLogger.warn(
        `Dropping ${dropped.length} product(s) without a name before save`,
        {
          supermarketId,
          sample: dropped.slice(0, 3).map(p => ({
            externalId: p.externalId,
            productUrl: p.productUrl,
            imageUrl: p.imageUrl,
          })),
        }
      );
    }
    if (named.length === 0) return 0;

    const startTime = Date.now();
    scraperLogger.debug(`Bulk saving ${named.length} products...`);

    try {
      // Prepare and normalize
      const preparedProducts = named.map(p => {
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
        this.productMappingRepository.batchFindMappingsByExternalIds(supermarketId, externalIds),
        this.productMappingRepository.batchFindMappingsByUrls(supermarketId, urls),
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
        const byNameBrand = await this.productMappingRepository.batchFindMappingsByNameAndBrand(
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
        await this.productMappingRepository.batchUpdateExistingProducts(existingProducts);
        existingMappingIds.push(...existingProducts.map(ep => ep.mapping.id));
      }

      // Batch create new
      const newMappingIds: string[] = [];
      if (newProducts.length > 0) {
        const created = await this.productMappingRepository.batchCreateProductsAndMappings(newProducts, supermarketId);
        newMappingIds.push(...created);
      }

      // Batch insert prices
      const allMappingIds = [...existingMappingIds, ...newMappingIds];
      const allProducts = [...existingProducts.map(ep => ep.product), ...newProducts];

      if (allMappingIds.length > 0) {
        // Reviewers lock the offer row before reading its latest price. Commit
        // the observation and corresponding price together, so neither readers
        // nor approvals can see a new availability state with an old price.
        const client = await getClient();
        try {
          await client.query('BEGIN');
          await this.productMappingRepository.recordObservations(allMappingIds, allProducts, client);
          await this.priceRepository.batchInsertPrices(allMappingIds, allProducts, currency, client);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
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

  async getProductById(productId: string): Promise<ProductWithPricesResult | null> {
    return this.productRepository.findByIdWithPrices(productId);
  }

  async searchProducts(searchTerm: string, limit: number = 50): Promise<(ProductWithCategory & { similarity_score: number })[]> {
    const normalizedSearch = normalizeProductName(searchTerm);
    return this.productRepository.search(normalizedSearch, limit);
  }

  async getLatestPricesBySupermarket(supermarketId: string): Promise<SupermarketProductEntry[]> {
    return this.productRepository.getLatestPricesBySupermarket(supermarketId);
  }

  async cleanupOldPrices(daysToKeep: number = 90): Promise<number> {
    const deletedCount = await this.priceRepository.cleanupOld(daysToKeep);
    scraperLogger.info(`Cleaned up ${deletedCount} old price records`);
    return deletedCount;
  }
}
