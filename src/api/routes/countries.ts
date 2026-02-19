import { Router } from 'express';
import { supermarketRepository } from '../../repositories';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const [countries, supermarkets] = await Promise.all([
      supermarketRepository.getAllCountries(),
      supermarketRepository.getAllSupermarketsBasic(),
    ]);

    const supermarketsByCountry = (supermarkets as any[]).reduce(
      (acc: Record<number, any[]>, sm) => {
        if (!acc[sm.country_id]) acc[sm.country_id] = [];
        acc[sm.country_id].push(sm);
        return acc;
      },
      {}
    );

    const data = countries.map(country => ({
      ...country,
      supermarkets: supermarketsByCountry[(country as any).id] || [],
    }));

    res.json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [country, supermarkets] = await Promise.all([
      supermarketRepository.findCountryById(id),
      supermarketRepository.getSupermarketsForCountry(id),
    ]);

    if (!country) {
      res.status(404).json({ error: 'Not Found', message: 'Country not found' });
      return;
    }

    res.json({ data: { ...country, supermarkets } });
  } catch (error) {
    next(error);
  }
});

export default router;
