import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validate';
import { isAdmin } from '../../auth';

const router = Router();

import { COUNTRY_LANGUAGES, translateText } from '../../services/MappingVocabulary';
const COUNTRY_LANGUAGE_MAP = Object.fromEntries(Object.entries(COUNTRY_LANGUAGES).map(([country, languages]) => [country, languages[0]]));

const translateSchema = z.object({
  text: z.string().min(1).max(200),
  target: z.string().min(2).max(5),
});

router.get('/', isAdmin, validateQuery(translateSchema), async (req, res, next) => {
  try {
    const { text, target } = req.validatedQuery as z.infer<typeof translateSchema>;
    const translated = await translateText(text, target);
    res.json({ translated });
  } catch (error) {
    next(error);
  }
});

// Expose the language map so frontend can look up language codes
router.get('/languages', (_req, res) => {
  res.json(COUNTRY_LANGUAGE_MAP);
});

export default router;
