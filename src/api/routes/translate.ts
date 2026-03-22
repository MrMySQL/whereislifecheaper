import { Router } from 'express';
import { z } from 'zod';
import { isAdmin } from '../../auth';
import { validateQuery } from '../middleware/validate';

const router = Router();

const translateSchema = z.object({
  text: z.string().min(1),
  target: z.string().min(2).max(5),
});

// In-memory cache: "text::target" -> translated
const cache = new Map<string, string>();

async function translateText(text: string, target: string): Promise<string> {
  const cacheKey = `${text}::${target}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_TRANSLATE_API_KEY environment variable is not set');
  }

  const { v2 } = await import('@google-cloud/translate');
  const translate = new v2.Translate({ key: apiKey });
  const [translation] = await translate.translate(text, target);

  cache.set(cacheKey, translation);
  return translation;
}

router.get('/', isAdmin, validateQuery(translateSchema), async (req, res, next) => {
  try {
    const { text, target } = req.validatedQuery as z.infer<typeof translateSchema>;
    const translated = await translateText(text, target);
    res.json({ original: text, translated, target_language: target });
  } catch (error) {
    next(error);
  }
});

export default router;
