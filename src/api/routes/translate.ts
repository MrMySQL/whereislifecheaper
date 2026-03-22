import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validate';
import { config } from '../../config/env';
import { isAdmin } from '../../auth';

const router = Router();

// Country code -> Google Translate language code
const COUNTRY_LANGUAGE_MAP: Record<string, string> = {
  TR: 'tr',
  ME: 'sr',  // Montenegrin uses Serbian
  ES: 'es',
  UZ: 'uz',
  UA: 'uk',
  KZ: 'kk',
  DE: 'de',
  MY: 'ms',
  AL: 'sq',
  AT: 'de',
  RU: 'ru',
  VN: 'vi',
  RO: 'ro',
  IT: 'it',
};

const translateSchema = z.object({
  text: z.string().min(1).max(200),
  target: z.string().min(2).max(5),
});

// In-memory translation cache with size limit
const MAX_CACHE_SIZE = 10000;
const translationCache = new Map<string, string>();

async function translateText(text: string, targetLang: string): Promise<string> {
  const cacheKey = `${text}::${targetLang}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = config.translate.apiKey;
  if (!apiKey) {
    throw new Error('GOOGLE_TRANSLATE_API_KEY not configured');
  }

  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      target: targetLang,
      source: 'en',
      format: 'text',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Translation API error: ${error}`);
  }

  const data = await response.json();
  const translations = data?.data?.translations;
  if (!translations?.length) {
    throw new Error('No translation returned from API');
  }
  const translated = translations[0].translatedText;

  if (translationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) translationCache.delete(firstKey);
  }
  translationCache.set(cacheKey, translated);
  return translated;
}

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
