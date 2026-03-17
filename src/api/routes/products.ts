import { Router } from 'express';
import { z } from 'zod';
import { productRepository } from '../../repositories';
import { CountryComparisonEntry } from '../../types/db.types';
import { validateQuery, paginationSchema } from '../middleware/validate';

const router = Router();

const productListSchema = paginationSchema.extend({
  search: z.string().optional(),
  category_id: z.string().uuid().optional(),
  brand: z.string().optional(),
});

const compareCountriesSchema = z.object({
  product_name: z.string().min(1, 'product_name query parameter is required'),
});

const priceHistoryQuerySchema = z.object({
  supermarket_id: z.string().uuid().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

router.get('/', validateQuery(productListSchema), async (req, res, next) => {
  try {
    const { search, category_id, brand, limit, offset } = req.validatedQuery as z.infer<typeof productListSchema>;

    const data = await productRepository.findAll(
      { search, categoryId: category_id, brand },
      { limit, offset }
    );

    res.json({
      data,
      count: data.length,
      pagination: { limit, offset },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/compare/countries', validateQuery(compareCountriesSchema), async (req, res, next) => {
  try {
    const { product_name } = req.validatedQuery as z.infer<typeof compareCountriesSchema>;

    const rows = await productRepository.compareByCountry(product_name);

    const byCountry = rows.reduce((acc: Record<string, { country_id: string; country_name: string; country_code: string; currency: string; products: Partial<CountryComparisonEntry>[] }>, row) => {
      const countryKey = row.country_code;
      if (!acc[countryKey]) {
        acc[countryKey] = {
          country_id: row.country_id,
          country_name: row.country_name,
          country_code: row.country_code,
          currency: row.currency_code,
          products: [],
        };
      }
      acc[countryKey].products.push({
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand,
        supermarket_name: row.supermarket_name,
        price: row.price,
        price_per_unit: row.price_per_unit,
        unit: row.unit,
        unit_quantity: row.unit_quantity,
        is_on_sale: row.is_on_sale,
        scraped_at: row.scraped_at,
      });
      return acc;
    }, {});

    res.json({
      data: Object.values(byCountry),
      search_term: product_name,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await productRepository.findByIdWithPrices(id);

    if (!data) {
      res.status(404).json({ error: 'Not Found', message: 'Product not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/price-history', validateQuery(priceHistoryQuerySchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { supermarket_id, days } = req.validatedQuery as z.infer<typeof priceHistoryQuerySchema>;

    const data = await productRepository.getPriceHistory(id, {
      supermarketId: supermarket_id,
      days,
    });

    res.json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

export default router;
