import { Router } from 'express';
import { canonicalProductRepository } from '../../repositories';
import { isAdmin } from '../../auth';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const data = await canonicalProductRepository.findAll(search as string | undefined);
    res.json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/mapped-products', isAdmin, async (req, res, next) => {
  try {
    const { search, stale_only = 'false', stale_days = '7', limit = '50', offset = '0' } = req.query;

    const staleDaysRaw = parseInt(stale_days as string, 10);
    const staleDaysThreshold = Number.isFinite(staleDaysRaw) && staleDaysRaw > 0 ? staleDaysRaw : 7;
    const limitRaw = parseInt(limit as string, 10);
    const offsetRaw = parseInt(offset as string, 10);
    const limitNum = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
    const offsetNum = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const { data, total } = await canonicalProductRepository.getMappedProducts(
      {
        search: typeof search === 'string' ? search.trim() : undefined,
        staleOnly: stale_only === 'true',
        staleDays: staleDaysThreshold,
      },
      { limit: limitNum, offset: offsetNum }
    );

    res.json({
      data,
      count: total,
      pagination: { limit: limitNum, offset: offsetNum },
      meta: { stale_days_threshold: staleDaysThreshold },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/comparison', async (req, res, next) => {
  try {
    const { search, limit = '100', offset = '0' } = req.query;
    const limitRaw = parseInt(limit as string, 10);
    const offsetRaw = parseInt(offset as string, 10);
    const limitNum = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const offsetNum = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const { data: rows, total } = await canonicalProductRepository.getComparison(
      { search: typeof search === 'string' ? search.trim() : undefined },
      { limit: limitNum, offset: offsetNum }
    );

    // Group by canonical product and organize by country
    const canonicalMap = new Map<number, any>();

    rows.forEach((row: any) => {
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

      const canonical = canonicalMap.get(row.canonical_id);
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

    canonicalMap.forEach(canonical => {
      const pricesByCountry: Record<string, any> = {};
      const usePerUnitPrice = canonical.show_per_unit_price;

      (Object.entries(canonical.products_by_country) as [string, any[]][]).forEach(
        ([countryCode, products]) => {
          if (products.length === 0) return;

          const productCount = products.length;
          const totalPrice = products.reduce((sum, p) => sum + p.price, 0);
          const avgPrice = totalPrice / productCount;

          const productsWithPpu = products.filter(p => p.price_per_unit != null);
          const avgPricePerUnit =
            productsWithPpu.length > 0
              ? productsWithPpu.reduce((sum, p) => sum + p.price_per_unit, 0) / productsWithPpu.length
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

      canonical.prices_by_country = pricesByCountry;
      delete canonical.products_by_country;
    });

    const comparison = Array.from(canonicalMap.values()).map(p => ({
      ...p,
      country_count: Object.keys(p.prices_by_country).length,
    }));

    res.json({ data: comparison, total, pagination: { limit: limitNum, offset: offsetNum } });
  } catch (error) {
    next(error);
  }
});

router.get('/products-by-country/:countryId', async (req, res, next) => {
  try {
    const { countryId } = req.params;
    const { search, supermarket_id, mapped_only, limit = '100', offset = '0' } = req.query;

    const { data, total } = await canonicalProductRepository.getProductsByCountry(
      countryId,
      {
        search: search as string | undefined,
        supermarketId: supermarket_id as string | undefined,
        mappedOnly: mapped_only === 'true',
      },
      {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      }
    );

    res.json({
      data,
      count: total,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', isAdmin, async (req, res, next) => {
  try {
    const { name, description, category_id, show_per_unit_price } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Bad Request', message: 'name is required' });
      return;
    }

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

router.put('/link', isAdmin, async (req, res, next) => {
  try {
    const { product_id, canonical_product_id } = req.body;

    if (!product_id) {
      res.status(400).json({ error: 'Bad Request', message: 'product_id is required' });
      return;
    }

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

router.patch('/:id', isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { show_per_unit_price, disabled } = req.body;

    if (show_per_unit_price === undefined && disabled === undefined) {
      res.status(400).json({ error: 'Bad Request', message: 'No fields to update' });
      return;
    }

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
