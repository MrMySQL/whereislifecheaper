import { Router } from 'express';
import { z } from 'zod';
import { canonicalProductRepository } from '../../repositories';
import { CanonicalComparisonRow } from '../../types/db.types';
import { isAdmin } from '../../auth';
import { validateQuery, validateBody, paginationSchema } from '../middleware/validate';

const router = Router();

const mappedProductsSchema = paginationSchema.extend({
  search: z.string().optional(),
  stale_only: z.enum(['true', 'false']).default('false'),
  stale_days: z.coerce.number().int().min(1).default(7),
});

const comparisonSchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().optional(),
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
    const { search, limit, offset } = req.validatedQuery as z.infer<typeof comparisonSchema>;

    const { data: rows, total } = await canonicalProductRepository.getComparison(
      { search: search?.trim() },
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
      const usePerUnitPrice = canonical.show_per_unit_price;

      Object.entries(canonical.products_by_country).forEach(
        ([countryCode, products]) => {
          if (products.length === 0) return;

          const productCount = products.length;
          const totalPrice = products.reduce((sum, p) => sum + p.price, 0);
          const avgPrice = totalPrice / productCount;

          const productsWithPpu = products.filter(p => p.price_per_unit != null);
          const avgPricePerUnit =
            productsWithPpu.length > 0
              ? productsWithPpu.reduce((sum, p) => sum + p.price_per_unit!, 0) / productsWithPpu.length
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
            price: usePerUnitPrice && avgPricePerUnit != null ? avgPricePerUnit : avgPrice,
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

    res.json({ data: comparison, total, pagination: { limit, offset } });
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

router.get('/products-by-country/:countryId/units', async (req, res, next) => {
  try {
    const { countryId } = req.params;
    const { supermarket_id } = req.query;
    const data = await canonicalProductRepository.getDistinctUnits(
      countryId,
      typeof supermarket_id === 'string' ? supermarket_id : undefined
    );
    res.json({ data });
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
