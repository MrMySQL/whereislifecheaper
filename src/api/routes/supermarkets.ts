import { Router } from 'express';
import { z } from 'zod';
import { supermarketRepository, scrapeLogRepository, productRepository } from '../../repositories';
import { validateQuery, paginationSchema } from '../middleware/validate';

const router = Router();

const supermarketListSchema = z.object({
  country_id: z.string().regex(/^\d+$/, 'Must be a numeric ID').optional(),
  active_only: z.enum(['true', 'false']).optional(),
});

const supermarketProductsSchema = paginationSchema.extend({
  search: z.string().optional(),
});

router.get('/', validateQuery(supermarketListSchema), async (req, res, next) => {
  try {
    const { country_id, active_only } = req.validatedQuery as z.infer<typeof supermarketListSchema>;

    const data = await supermarketRepository.findAll({
      countryId: country_id,
      activeOnly: active_only === 'true',
    });

    res.json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [supermarket, recentScrapes] = await Promise.all([
      supermarketRepository.findByIdWithProductCount(id),
      scrapeLogRepository.getRecentForSupermarket(id, 10),
    ]);

    if (!supermarket) {
      res.status(404).json({ error: 'Not Found', message: 'Supermarket not found' });
      return;
    }

    res.json({ data: { ...supermarket, recent_scrapes: recentScrapes } });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/products', validateQuery(supermarketProductsSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { search, limit, offset } = req.validatedQuery as z.infer<typeof supermarketProductsSchema>;

    const data = await productRepository.getProductsForSupermarket(
      id,
      { search },
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

export default router;
