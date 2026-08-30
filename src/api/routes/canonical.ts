import { Router } from 'express';
import { z } from 'zod';
import { canonicalProductRepository } from '../../repositories';
import { CanonicalComparisonRow } from '../../types/db.types';
import { isAdmin } from '../../auth';
import { validateQuery, validateBody, paginationSchema } from '../middleware/validate';
import { calculatePricePerUnit } from '../../utils/normalizer';

const router = Router();

const mappedProductsSchema = paginationSchema.extend({
  search: z.string().optional(),
  stale_only: z.enum(['true', 'false']).default('false'),
  stale_days: z.coerce.number().int().min(1).default(7),
});

const comparisonSchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().optional(),
  // Opt-in freshness bound. Off by default: switching it on while the scrape
  // pipeline is down would empty the table rather than show stale prices, and
  // the response's `freshness` block already tells callers how old the data is.
  max_age_days: z.coerce.number().int().min(1).max(365).optional(),
});

const productsByCountrySchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().optional(),
  supermarket_id: z.string().regex(/^\d+$/, 'Must be a numeric ID').optional(),
  mapped_only: z.enum(['true', 'false']).optional(),
  unit: z.string().optional(),
  unit_quantity: z.coerce.number().positive().optional(),
});

const createCanonicalSchema = z.object({
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  category_id: z.string().regex(/^\d+$/, 'Must be a numeric ID').optional(),
  show_per_unit_price: z.boolean().optional(),
});

const linkProductSchema = z.object({
  product_id: z.coerce.string().min(1, 'product_id is required'),
  canonical_product_id: z.coerce.string().nullable().optional(),
});

const updateCanonicalSchema = z.object({
  show_per_unit_price: z.boolean().optional(),
  disabled: z.boolean().optional(),
}).refine(
  data => data.show_per_unit_price !== undefined || data.disabled !== undefined,
  { message: 'At least one field (show_per_unit_price or disabled) must be provided' }
);

router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const data = await canonicalProductRepository.findAll(
      typeof search === 'string' ? search : undefined
    );
    res.json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/mapped-products', isAdmin, validateQuery(mappedProductsSchema), async (req, res, next) => {
  try {
    const { search, stale_only, stale_days, limit, offset } = req.validatedQuery as z.infer<typeof mappedProductsSchema>;

    const { data, total } = await canonicalProductRepository.getMappedProducts(
      {
        search: search?.trim(),
        staleOnly: stale_only === 'true',
        staleDays: stale_days,
      },
      { limit, offset }
    );

    res.json({
      data,
      count: total,
      pagination: { limit, offset },
      meta: { stale_days_threshold: stale_days },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/comparison', validateQuery(comparisonSchema), async (req, res, next) => {
  try {
    const { search, limit, offset, max_age_days } = req.validatedQuery as z.infer<typeof comparisonSchema>;

    const { data: rows, total, freshness } = await canonicalProductRepository.getComparison(
      { search: search?.trim(), maxAgeDays: max_age_days },
      { limit, offset }
    );

    interface CountryProduct {
      product_id: string;
      product_name: string;
      brand: string | null;
      unit: string | null;
      unit_quantity: number | null;
      image_url: string | null;
      product_url: string;
      price: number;
      price_per_unit: number | null;
      currency: string;
      original_price: number | null;
      is_on_sale: boolean;
      supermarket: string;
      country_name: string;
      scraped_at: Date;
    }

    interface CountryPriceSummary {
      product_id: string;
      product_name: string;
      brand: string | null;
      unit: string | null;
      unit_quantity: number | null;
      image_url: string | null;
      product_url: string;
      price: number;
      price_per_unit: number | null;
      currency: string;
      original_price: number | null;
      is_on_sale: boolean;
      supermarket: string;
      country_name: string;
      scraped_at: Date;
      product_count: number;
      products: Omit<CountryProduct, 'currency' | 'original_price' | 'is_on_sale' | 'country_name' | 'scraped_at'>[];
    }

    interface CanonicalGroup {
      canonical_id: string;
      canonical_name: string;
      canonical_description: string | null;
      show_per_unit_price: boolean;
      category: string | null;
      products_by_country: Record<string, CountryProduct[]>;
    }

    // Group by canonical product and organize by country
    const canonicalMap = new Map<string, CanonicalGroup>();

    rows.forEach((row: CanonicalComparisonRow) => {
      if (!canonicalMap.has(row.canonical_id)) {
        canonicalMap.set(row.canonical_id, {
          canonical_id: row.canonical_id,
          canonical_name: row.canonical_name,
          canonical_description: row.canonical_description,
          show_per_unit_price: row.show_per_unit_price ?? false,
          category: row.category_name,
          products_by_country: {},
        });
      }

      const canonical = canonicalMap.get(row.canonical_id)!;
      const countryCode = row.country_code;

      if (!canonical.products_by_country[countryCode]) {
        canonical.products_by_country[countryCode] = [];
      }

      canonical.products_by_country[countryCode].push({
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand,
        unit: row.unit,
        unit_quantity: row.unit_quantity,
        image_url: row.image_url,
        product_url: row.product_url,
        price: parseFloat(row.price),
        price_per_unit: row.price_per_unit ? parseFloat(row.price_per_unit) : null,
        currency: row.currency || row.currency_code,
        original_price: row.original_price ? parseFloat(row.original_price) : null,
        is_on_sale: row.is_on_sale,
        supermarket: row.supermarket_name,
        country_name: row.country_name,
        scraped_at: row.scraped_at,
      });
    });

    const comparison = Array.from(canonicalMap.values()).map(canonical => {
      const pricesByCountry: Record<string, CountryPriceSummary> = {};
      Object.entries(canonical.products_by_country).forEach(
        ([countryCode, products]) => {
          if (products.length === 0) return;

          const productCount = products.length;
          const totalPrice = products.reduce((sum, p) => sum + p.price, 0);
          const avgPrice = totalPrice / productCount;

          // Derive per-unit price for products missing it (e.g. unit=kg with no quantity,
          // where the raw price IS the per-kg price).
          const pricesPerUnit = products
            .map(p =>
              p.price_per_unit ??
              calculatePricePerUnit(p.price, p.unit_quantity ?? undefined, p.unit ?? undefined) ??
              null
            )
            .filter((v): v is number => v != null);
          const avgPricePerUnit =
            pricesPerUnit.length > 0
              ? pricesPerUnit.reduce((sum, v) => sum + v, 0) / pricesPerUnit.length
              : null;

          const firstProduct = products[0];
          pricesByCountry[countryCode] = {
            product_id: firstProduct.product_id,
            product_name: firstProduct.product_name,
            brand: firstProduct.brand,
            unit: firstProduct.unit,
            unit_quantity: firstProduct.unit_quantity,
            image_url: firstProduct.image_url,
            product_url: firstProduct.product_url,
            // Always expose the actual purchase price as `price`. The
            // frontend uses `price_per_unit` for per-kg/per-l comparisons
            // when `show_per_unit_price` is true, so overwriting `price`
            // with the per-unit average corrupts the displayed local price
            // (e.g. €1.40 shown for a €0.28/0.2kg cucumber).
            price: avgPrice,
            price_per_unit: avgPricePerUnit,
            currency: firstProduct.currency,
            original_price: firstProduct.original_price,
            is_on_sale: products.some(p => p.is_on_sale),
            supermarket: firstProduct.supermarket,
            country_name: firstProduct.country_name,
            scraped_at: firstProduct.scraped_at,
            product_count: productCount,
            products: products.map(p => ({
              product_id: p.product_id,
              product_name: p.product_name,
              brand: p.brand,
              unit: p.unit,
              unit_quantity: p.unit_quantity,
              price: p.price,
              price_per_unit: p.price_per_unit,
              supermarket: p.supermarket,
              image_url: p.image_url,
              product_url: p.product_url,
              // Each constituent carries its own date. The country-level
              // scraped_at is only the first product's, which says nothing
              // about the rest of an average.
              scraped_at: p.scraped_at,
            })),
          };
        }
      );

      return {
        canonical_id: canonical.canonical_id,
        canonical_name: canonical.canonical_name,
        canonical_description: canonical.canonical_description,
        show_per_unit_price: canonical.show_per_unit_price,
        category: canonical.category,
        prices_by_country: pricesByCountry,
        country_count: Object.keys(pricesByCountry).length,
      };
    });

    // Tell callers how old this data actually is. Without it a dead scrape
    // pipeline is indistinguishable from a healthy one: the table renders the
    // same either way, just with older numbers.
    //
    // Computed over the whole filtered dataset, not this page — the home page
    // asks for the first 100 of `total` and draws a site-wide stale-data
    // notice from the answer.
    const toMs = (value: Date | null) => {
      if (value === null) return null;
      const ms = new Date(value).getTime();
      return Number.isFinite(ms) ? ms : null;
    };
    const newest = toMs(freshness.newest);
    const oldest = toMs(freshness.oldest);
    const ageInDays = (ms: number) => Math.floor((Date.now() - ms) / 86_400_000);

    res.json({
      data: comparison,
      total,
      pagination: { limit, offset },
      freshness: {
        newest_price_at: newest === null ? null : new Date(newest).toISOString(),
        oldest_price_at: oldest === null ? null : new Date(oldest).toISOString(),
        newest_age_days: newest === null ? null : ageInDays(newest),
        oldest_age_days: oldest === null ? null : ageInDays(oldest),
        max_age_days: max_age_days ?? null,
        scope: 'dataset' as const,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/products-by-country/:countryId', validateQuery(productsByCountrySchema), async (req, res, next) => {
  try {
    const { countryId } = req.params;
    const { search, supermarket_id, mapped_only, unit, unit_quantity, limit, offset } = req.validatedQuery as z.infer<typeof productsByCountrySchema>;

    const { data, total } = await canonicalProductRepository.getProductsByCountry(
      countryId,
      {
        search,
        supermarketId: supermarket_id,
        mappedOnly: mapped_only === 'true',
        unit,
        unitQuantity: unit_quantity,
      },
      { limit, offset }
    );

    res.json({
      data,
      count: total,
      pagination: { limit, offset },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', isAdmin, validateBody(createCanonicalSchema), async (req, res, next) => {
  try {
    const { name, description, category_id, show_per_unit_price } = req.validatedBody as z.infer<typeof createCanonicalSchema>;

    const data = await canonicalProductRepository.create({
      name,
      description,
      categoryId: category_id,
      showPerUnitPrice: show_per_unit_price,
    });

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

router.put('/link', isAdmin, validateBody(linkProductSchema), async (req, res, next) => {
  try {
    const { product_id, canonical_product_id } = req.validatedBody as z.infer<typeof linkProductSchema>;

    const data = await canonicalProductRepository.linkProduct(
      product_id,
      canonical_product_id || null
    );

    if (!data) {
      res.status(404).json({ error: 'Not Found', message: 'Product not found' });
      return;
    }

    res.json({
      message: canonical_product_id ? 'Product linked' : 'Product unlinked',
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', isAdmin, validateBody(updateCanonicalSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { show_per_unit_price, disabled } = req.validatedBody as z.infer<typeof updateCanonicalSchema>;

    const data = await canonicalProductRepository.update(id, {
      showPerUnitPrice: show_per_unit_price,
      disabled,
    });

    if (!data) {
      res.status(404).json({ error: 'Not Found', message: 'Canonical product not found' });
      return;
    }

    res.json({ message: 'Updated successfully', data });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/products', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await canonicalProductRepository.getLinkedProducts(id);
    res.json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:id', isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await canonicalProductRepository.deleteProduct(id);

    if (!data) {
      res.status(404).json({ error: 'Not Found', message: 'Product not found' });
      return;
    }

    res.json({ message: 'Product deleted successfully', data });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await canonicalProductRepository.deleteWithUnlink(id);

    if (!data) {
      res.status(404).json({ error: 'Not Found', message: 'Canonical product not found' });
      return;
    }

    res.json({ message: 'Deleted successfully', data });
  } catch (error) {
    next(error);
  }
});

export default router;
