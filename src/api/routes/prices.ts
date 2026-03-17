import { Router } from 'express';
import { z } from 'zod';
import { priceRepository } from '../../repositories';
import { BasketEntry } from '../../types/db.types';
import { validateQuery, paginationSchema } from '../middleware/validate';

const router = Router();

const latestPricesSchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  country_id: z.string().uuid().optional(),
  supermarket_id: z.string().uuid().optional(),
});

const compareSchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().optional(),
});

const basketSchema = z.object({
  products: z.string().min(1, 'products query parameter is required (comma-separated product names)'),
});

router.get('/latest', validateQuery(latestPricesSchema), async (req, res, next) => {
  try {
    const { country_id, supermarket_id, limit, offset } = req.validatedQuery as z.infer<typeof latestPricesSchema>;

    const data = await priceRepository.getLatest(
      { countryId: country_id, supermarketId: supermarket_id },
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

router.get('/stats', async (_req, res, next) => {
  try {
    const data = await priceRepository.getStats();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get('/basket', validateQuery(basketSchema), async (req, res, next) => {
  try {
    const { products } = req.validatedQuery as z.infer<typeof basketSchema>;

    const productList = products.split(',').map(p => p.trim()).filter(Boolean);
    if (productList.length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'At least one product name is required',
      });
      return;
    }

    const rows = await priceRepository.getBasket(productList);

    interface BasketByCountry {
      country_id: string;
      country_name: string;
      country_code: string;
      currency: string;
      items: { product_name: string; price: number; supermarket: string }[];
      total: number;
    }

    const byCountry = rows.reduce((acc: Record<string, BasketByCountry>, row: BasketEntry) => {
      const countryKey = row.country_code;
      if (!acc[countryKey]) {
        acc[countryKey] = {
          country_id: row.country_id,
          country_name: row.country_name,
          country_code: row.country_code,
          currency: row.currency_code,
          items: [],
          total: 0,
        };
      }
      acc[countryKey].items.push({
        product_name: row.product_name,
        price: parseFloat(row.cheapest_price),
        supermarket: row.cheapest_supermarket,
      });
      acc[countryKey].total += parseFloat(row.cheapest_price);
      return acc;
    }, {});

    Object.values(byCountry).forEach(country => {
      country.total = Math.round(country.total * 100) / 100;
    });

    res.json({ data: Object.values(byCountry), requested_products: productList });
  } catch (error) {
    next(error);
  }
});

router.get('/compare', validateQuery(compareSchema), async (req, res, next) => {
  try {
    const { search, limit, offset } = req.validatedQuery as z.infer<typeof compareSchema>;

    const rows = await priceRepository.compare(
      { search },
      { limit, offset }
    );

    interface CountryPrice {
      price: number;
      currency: string;
      original_price: number | null;
      is_on_sale: boolean;
      supermarket: string;
      country_name: string;
      scraped_at: Date;
    }
    interface CompareProduct {
      product_name: string;
      brand: string | null;
      unit: string | null;
      unit_quantity: number | null;
      prices_by_country: Record<string, CountryPrice>;
    }

    const productMap = new Map<string, CompareProduct>();

    rows.forEach((row) => {
      const key = row.normalized_name || row.product_name.toLowerCase();

      if (!productMap.has(key)) {
        productMap.set(key, {
          product_name: row.product_name,
          brand: row.brand,
          unit: row.unit,
          unit_quantity: row.unit_quantity,
          prices_by_country: {},
        });
      }

      const product = productMap.get(key)!;
      const countryCode = row.country_code;

      if (
        !product.prices_by_country[countryCode] ||
        row.price < product.prices_by_country[countryCode].price
      ) {
        product.prices_by_country[countryCode] = {
          price: row.price,
          currency: row.currency || row.currency_code,
          original_price: row.original_price,
          is_on_sale: row.is_on_sale,
          supermarket: row.supermarket_name,
          country_name: row.country_name,
          scraped_at: row.scraped_at,
        };
      }
    });

    const comparison = Array.from(productMap.values())
      .filter(p => Object.keys(p.prices_by_country).length >= 2)
      .map(p => ({ ...p, country_count: Object.keys(p.prices_by_country).length }));

    res.json({
      data: comparison,
      total: comparison.length,
      pagination: { limit, offset },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
