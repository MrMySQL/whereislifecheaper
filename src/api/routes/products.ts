import { Router } from 'express';
import { productRepository } from '../../repositories';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { search, category_id, brand, limit = '50', offset = '0' } = req.query;

    const data = await productRepository.findAll(
      {
        search: search as string | undefined,
        categoryId: category_id as string | undefined,
        brand: brand as string | undefined,
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

router.get('/compare/countries', async (req, res, next) => {
  try {
    const { product_name } = req.query;

    if (!product_name) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'product_name query parameter is required',
      });
      return;
    }

    const rows = await productRepository.compareByCountry(product_name as string);

    const byCountry = rows.reduce((acc: Record<string, any>, row: any) => {
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

router.get('/:id/price-history', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { supermarket_id, days = '30' } = req.query;

    const data = await productRepository.getPriceHistory(id, {
      supermarketId: supermarket_id as string | undefined,
      days: parseInt(days as string),
    });

    res.json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

export default router;
