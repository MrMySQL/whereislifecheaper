import { Router } from 'express';
import { query } from '../../config/database';

const router = Router();

/**
 * GET /api/countries
 * Get all countries
 */
router.get('/', async (_req, res, next) => {
  try {
    const countriesResult = await query(
      `SELECT * FROM countries ORDER BY name`
    );

    const supermarketsResult = await query(
      `SELECT id, name, country_id, is_active
       FROM supermarkets
       ORDER BY name`
    );

    const supermarketsByCountry = supermarketsResult.rows.reduce((acc: Record<number, typeof supermarketsResult.rows>, sm) => {
      if (!acc[sm.country_id]) {
        acc[sm.country_id] = [];
      }
      acc[sm.country_id].push(sm);
      return acc;
    }, {});

    const data = countriesResult.rows.map((country) => ({
      ...country,
      supermarkets: supermarketsByCountry[country.id] || [],
    }));

    res.json({
      data,
      count: countriesResult.rowCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/countries/:id
 * Get country by ID with supermarkets
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const countryResult = await query(
      `SELECT * FROM countries WHERE id = $1`,
      [id]
    );

    if (countryResult.rows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Country not found',
      });
      return;
    }

    const supermarketsResult = await query(
      `SELECT id, name, website_url, logo_url, is_active
       FROM supermarkets
       WHERE country_id = $1
       ORDER BY name`,
      [id]
    );

    res.json({
      data: {
        ...countryResult.rows[0],
        supermarkets: supermarketsResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
