import { Router } from 'express';
import { z } from 'zod';
import { isAdmin } from '../../auth';
import { validateQuery } from '../middleware/validate';
import { apiLogger } from '../../utils/logger';

const router = Router();

const translateSchema = z.object({
  text: z.string().min(1),
  target: z.string().min(2).max(5),
});

// Bounded LRU cache for translations (max 500 entries)
const MAX_CACHE_SIZE = 500;
const cache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const value = cache.get(key);
  if (value !== undefined) {
    // Move to end (most recently used)
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

function cacheSet(key: string, value: string): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry (first key in Map iteration order)
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

async function translateText(text: string, target: string): Promise<string> {
  const cacheKey = `${text}::${target}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_TRANSLATE_API_KEY environment variable is not set');
  }

  const { v2 } = await import('@google-cloud/translate');
  const translate = new v2.Translate({ key: apiKey });
  const [translation] = await translate.translate(text, target);

  cacheSet(cacheKey, translation);
  apiLogger.info('Translation completed', { text, target, translated: translation });
  return translation;
}

router.get('/', isAdmin, validateQuery(translateSchema), async (req, res, next) => {
  try {
    const { text, target } = req.validatedQuery as z.infer<typeof translateSchema>;
    const translated = await translateText(text, target);
    res.json({ original: text, translated, target_language: target });
  } catch (error) {
    apiLogger.error('Translation failed', { error: (error as Error).message });
    next(error);
  }
});

export default router;
