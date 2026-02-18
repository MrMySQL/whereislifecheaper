import { Router } from 'express';
import { priceRepository } from '../../repositories';

const router = Router();

router.get('/latest', async (req, res, next) => {
  try {
    const { country_id, supermarket_id, limit = '100', offset = '0' } = req.query;

    const data = await priceRepository.getLatest(
      {
        countryId: country_id as string | undefined,
        supermarketId: supermarket_id as string | undefined,
      },
      {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      }
    );

    res.json({
      data,
      count: data.length,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
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

router.get('/basket', async (req, res, next) => {
  try {
    const { products } = req.query;

    if (!products) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'products query parameter is required (comma-separated product names)',
      });
      return;
    }

    const productList = (products as string).split(',').map(p => p.trim());
    const rows = await priceRepository.getBasket(productList);

    const byCountry = rows.reduce((acc: Record<string, any>, row: any) => {
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

    Object.values(byCountry).forEach((country: any) => {
      country.total = Math.round(country.total * 100) / 100;
    });

    res.json({ data: Object.values(byCountry), requested_products: productList });
  } catch (error) {
    next(error);
  }
});

router.get('/compare', async (req, res, next) => {
  try {
    const { search, limit = '100', offset = '0' } = req.query;

    const rows = await priceRepository.compare(
      { search: search as string | undefined },
      { limit: parseInt(limit as string), offset: parseInt(offset as string) }
    );

    const productMap = new Map<string, any>();

    rows.forEach((row: any) => {
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

      const product = productMap.get(key);
      const countryCode = row.country_code;

      if (
        !product.prices_by_country[countryCode] ||
        row.price < product.prices_by_country[countryCode].price
      ) {
        product.prices_by_country[countryCode] = {
          price: parseFloat(row.price),
          currency: row.currency || row.currency_code,
          original_price: row.original_price ? parseFloat(row.original_price) : null,
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
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
