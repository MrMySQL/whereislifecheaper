import { Router } from 'express';
import { supermarketRepository, scrapeLogRepository, productRepository } from '../../repositories';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { country_id, active_only } = req.query;

    const data = await supermarketRepository.findAll({
      countryId: country_id as string | undefined,
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

router.get('/:id/products', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = '50', offset = '0', search } = req.query;

    const data = await productRepository.getProductsForSupermarket(
      id,
      { search: search as string | undefined },
      { limit: parseInt(limit as string), offset: parseInt(offset as string) }
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

export default router;
