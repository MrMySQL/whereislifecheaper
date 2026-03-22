# Mapping Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add unit/weight filters and bilingual search to the admin mapping page to speed up canonical product mapping.

**Architecture:** Two independent features added to existing stack. Unit filters extend the existing products-by-country query with `unit` and `unit_quantity` params. Bilingual search adds a new `/api/translate` endpoint backed by Google Cloud Translation API with in-memory cache, called by the frontend before searching.

**Tech Stack:** Express.js backend, React frontend (Mantine-style components), PostgreSQL, Google Cloud Translation API (`@google-cloud/translate` v3).

---

### Task 1: Add unit/quantity filter params to backend query

**Files:**
- Modify: `src/api/routes/canonical.ts:21-26` (schema)
- Modify: `src/api/routes/canonical.ts:250-273` (route handler)
- Modify: `src/repositories/CanonicalProductRepository.ts:321-400` (query)

**Step 1: Add `unit` and `unit_quantity` to the Zod validation schema**

In `src/api/routes/canonical.ts`, update `productsByCountrySchema`:

```typescript
const productsByCountrySchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().optional(),
  supermarket_id: z.string().regex(/^\d+$/, 'Must be a numeric ID').optional(),
  mapped_only: z.enum(['true', 'false']).optional(),
  unit: z.string().optional(),
  unit_quantity: z.coerce.number().positive().optional(),
});
```

**Step 2: Pass new params from route handler to repository**

In `src/api/routes/canonical.ts`, update the route handler at line 250:

```typescript
router.get('/products-by-country/:countryId', validateQuery(productsByCountrySchema), async (req, res, next) => {
  try {
    const { countryId } = req.params;
    const { search, supermarket_id, mapped_only, unit, unit_quantity, limit, offset } = req.validatedQuery as z.infer<typeof productsByCountrySchema>;

    const { data, total } = await canonicalProductRepository.getProductsByCountry(
      countryId,
      {
        search,
        supermarketId: supermarket_id,
        mappedOnly: mapped_only === 'true',
        unit,
        unitQuantity: unit_quantity,
      },
      { limit, offset }
    );

    res.json({
      data,
      count: total,
      pagination: { limit, offset },
    });
  } catch (error) {
    next(error);
  }
});
```

**Step 3: Add unit/quantity filtering to repository query**

In `src/repositories/CanonicalProductRepository.ts`, update the `getProductsByCountry` method:

Update the method signature filters type:
```typescript
filters: { search?: string; supermarketId?: string; mappedOnly?: boolean; unit?: string; unitQuantity?: number }
```

Add these filter clauses after the existing `mappedOnly` filter (after line 362):

```typescript
if (filters.unit) {
  sql += ` AND p.unit = $${i++}`;
  params.push(filters.unit);
}
if (filters.unitQuantity !== undefined) {
  sql += ` AND p.unit_quantity = $${i++}`;
  params.push(filters.unitQuantity);
}
```

Add the same clauses to the count query (after line 392):

```typescript
if (filters.unit) {
  countSql += ` AND p.unit = $${ci++}`;
  countParams.push(filters.unit);
}
if (filters.unitQuantity !== undefined) {
  countSql += ` AND p.unit_quantity = $${ci++}`;
  countParams.push(filters.unitQuantity);
}
```

**Step 4: Verify TypeScript compiles**

Run: `npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add src/api/routes/canonical.ts src/repositories/CanonicalProductRepository.ts
git commit -m "feat: add unit and unit_quantity filters to products-by-country endpoint"
```

---

### Task 2: Add unit/quantity filter controls to frontend

**Files:**
- Modify: `frontend/src/pages/admin/Mapping.tsx` (state, UI, API call)
- Modify: `frontend/src/services/api.ts:85-91` (add params)

**Step 1: Add `unit` and `unit_quantity` params to the frontend API service**

In `frontend/src/services/api.ts`, update `getProductsByCountry`:

```typescript
getProductsByCountry: async (countryId: number, params?: {
  search?: string;
  supermarket_id?: number;
  mapped_only?: boolean;
  unit?: string;
  unit_quantity?: number;
  limit?: number;
  offset?: number;
}): Promise<{
  data: Product[];
  count: number;
}> => {
  const response = await api.get<{ data: Product[]; count: number }>(
    `/canonical/products-by-country/${countryId}`,
    { params }
  );
  return response.data;
},
```

**Step 2: Add state variables and URL param handling in Mapping.tsx**

After the existing `selectedSupermarketId` line (line 47), add:

```typescript
const selectedUnit = searchParams.get('unit') || '';
const selectedUnitQuantity = searchParams.get('unit_quantity') || '';
```

Add handler functions (near the other handler functions):

```typescript
const handleUnitChange = useCallback((unit: string) => {
  updateUrlParams((params) => {
    if (unit) {
      params.set('unit', unit);
    } else {
      params.delete('unit');
      params.delete('unit_quantity');
    }
    params.delete('page');
  });
}, [updateUrlParams]);

const handleUnitQuantityChange = useCallback((qty: string) => {
  updateUrlParams((params) => {
    if (qty) {
      params.set('unit_quantity', qty);
    } else {
      params.delete('unit_quantity');
    }
    params.delete('page');
  });
}, [updateUrlParams]);
```

**Step 3: Pass new params to the API query**

Update the `useQuery` for products (line 109-123) to include the new filters:

```typescript
const { data: productsData, isLoading: productsLoading } = useQuery({
  queryKey: ['products', selectedCountryId, selectedSupermarketId, productSearch, productPage, mappedOnly, selectedUnit, selectedUnitQuantity],
  queryFn: () =>
    selectedCountryId
      ? canonicalApi.getProductsByCountry(selectedCountryId, {
          search: productSearch || undefined,
          supermarket_id: selectedSupermarketId || undefined,
          mapped_only: mappedOnly || undefined,
          unit: selectedUnit || undefined,
          unit_quantity: selectedUnitQuantity ? Number(selectedUnitQuantity) : undefined,
          limit: PRODUCTS_PER_PAGE,
          offset: productPage * PRODUCTS_PER_PAGE,
        })
      : Promise.resolve({ data: [], count: 0 }),
  enabled: !!selectedCountryId,
  placeholderData: undefined,
});
```

**Step 4: Add unit filter dropdown and quantity input to the filters row**

In the filters row (after the supermarket selector, around line 484), add:

```tsx
{/* Unit filter */}
{selectedCountryId && (
  <div className="sm:w-36">
    <select
      value={selectedUnit}
      onChange={(e) => handleUnitChange(e.target.value)}
      className="input h-12 py-0"
    >
      <option value="">Unit</option>
      <option value="kg">kg</option>
      <option value="g">g</option>
      <option value="l">L</option>
      <option value="ml">ml</option>
      <option value="pcs">pcs</option>
    </select>
  </div>
)}

{/* Quantity filter */}
{selectedCountryId && selectedUnit && (
  <div className="sm:w-28">
    <input
      type="number"
      placeholder="Qty"
      value={selectedUnitQuantity}
      onChange={(e) => handleUnitQuantityChange(e.target.value)}
      className="input h-12 py-0"
      min="0"
      step="0.1"
    />
  </div>
)}
```

**Step 5: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/pages/admin/Mapping.tsx frontend/src/services/api.ts
git commit -m "feat: add unit and quantity filter controls to mapping page"
```

---

### Task 3: Add translation API endpoint (backend)

**Files:**
- Create: `src/api/routes/translate.ts`
- Modify: `src/api/server.ts` (register route)
- Modify: `src/config/env.ts` (add Google Translate API key env var)

**Step 1: Add `GOOGLE_TRANSLATE_API_KEY` to env config**

In `src/config/env.ts`, add to the `envSchema`:

```typescript
GOOGLE_TRANSLATE_API_KEY: z.string().optional(),
```

Add to the exported `config` object:

```typescript
translate: {
  apiKey: envVars.GOOGLE_TRANSLATE_API_KEY,
},
```

**Step 2: Create the country-to-language mapping and translate route**

Create `src/api/routes/translate.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validate';
import { config } from '../../config/env';
import { isAdmin } from '../../auth';

const router = Router();

// Country code → Google Translate language code
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

// In-memory translation cache
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
  const translated = data.data.translations[0].translatedText;

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
```

**Step 3: Register the translate route in server.ts**

In `src/api/server.ts`, add import and route registration:

```typescript
import translateRouter from './routes/translate';
```

Add after the existing route registrations (after line 106):

```typescript
app.use('/api/translate', translateRouter);
```

**Step 4: Verify TypeScript compiles**

Run: `npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add src/api/routes/translate.ts src/api/server.ts src/config/env.ts
git commit -m "feat: add translation API endpoint with Google Translate"
```

---

### Task 4: Add bilingual search to frontend

**Files:**
- Modify: `frontend/src/services/api.ts` (add translate API call)
- Modify: `frontend/src/pages/admin/Mapping.tsx` (call translate before search)

**Step 1: Add translate API function to frontend service**

In `frontend/src/services/api.ts`, add a new `translateApi` object:

```typescript
export const translateApi = {
  translate: async (text: string, target: string): Promise<string> => {
    const response = await api.get<{ translated: string }>('/translate', {
      params: { text, target },
    });
    return response.data.translated;
  },
  getLanguages: async (): Promise<Record<string, string>> => {
    const response = await api.get<Record<string, string>>('/translate/languages');
    return response.data;
  },
};
```

**Step 2: Fetch the language map and add translation logic to Mapping.tsx**

Add import at the top of `Mapping.tsx`:

```typescript
import { countriesApi, canonicalApi, supermarketsApi, translateApi } from '../../services/api';
```

Add a query to fetch the language map (near the other queries):

```typescript
const { data: languageMap = {} } = useQuery({
  queryKey: ['translate-languages'],
  queryFn: translateApi.getLanguages,
  staleTime: Infinity,
});
```

**Step 3: Add translation state and logic**

Add state for the translated search term:

```typescript
const [translatedSearch, setTranslatedSearch] = useState('');
```

Find the selected country's language code:

```typescript
const selectedCountryCode = useMemo(() => {
  if (!selectedCountryId) return null;
  const country = countries.find((c: Country) => c.id === selectedCountryId);
  return country?.code || null;
}, [selectedCountryId, countries]);

const targetLanguage = selectedCountryCode ? languageMap[selectedCountryCode] : null;
```

Add a translation effect that fires when the debounced search changes:

```typescript
useEffect(() => {
  if (!productSearch || !targetLanguage) {
    setTranslatedSearch('');
    return;
  }

  // Only translate if the search term looks English (ASCII-only)
  const isAscii = /^[\x00-\x7F]+$/.test(productSearch);
  if (!isAscii) {
    setTranslatedSearch('');
    return;
  }

  let cancelled = false;
  translateApi.translate(productSearch, targetLanguage).then((result) => {
    if (!cancelled) {
      setTranslatedSearch(result);
    }
  }).catch(() => {
    if (!cancelled) {
      setTranslatedSearch('');
    }
  });

  return () => { cancelled = true; };
}, [productSearch, targetLanguage]);
```

**Step 4: Update the search query to include translated term**

Update the `useQuery` for products to combine original + translated search:

```typescript
const combinedSearch = useMemo(() => {
  if (!productSearch) return undefined;
  if (translatedSearch && translatedSearch.toLowerCase() !== productSearch.toLowerCase()) {
    return `${productSearch},${translatedSearch}`;
  }
  return productSearch;
}, [productSearch, translatedSearch]);
```

Update the query key and queryFn to use `combinedSearch`:

```typescript
const { data: productsData, isLoading: productsLoading } = useQuery({
  queryKey: ['products', selectedCountryId, selectedSupermarketId, combinedSearch, productPage, mappedOnly, selectedUnit, selectedUnitQuantity],
  queryFn: () =>
    selectedCountryId
      ? canonicalApi.getProductsByCountry(selectedCountryId, {
          search: combinedSearch,
          supermarket_id: selectedSupermarketId || undefined,
          mapped_only: mappedOnly || undefined,
          unit: selectedUnit || undefined,
          unit_quantity: selectedUnitQuantity ? Number(selectedUnitQuantity) : undefined,
          limit: PRODUCTS_PER_PAGE,
          offset: productPage * PRODUCTS_PER_PAGE,
        })
      : Promise.resolve({ data: [], count: 0 }),
  enabled: !!selectedCountryId,
  placeholderData: undefined,
});
```

**Step 5: Update backend search to support comma-separated terms**

In `src/repositories/CanonicalProductRepository.ts`, update the search filter in `getProductsByCountry` to handle comma-separated search terms:

Replace the existing search filter block:

```typescript
if (filters.search) {
  const terms = filters.search.split(',').map(t => t.trim()).filter(Boolean);
  if (terms.length === 1) {
    sql += ` AND (p.name ILIKE $${i} OR p.brand ILIKE $${i})`;
    params.push(`%${terms[0]}%`);
    i++;
  } else {
    const orClauses = terms.map((term) => {
      const idx = i++;
      params.push(`%${term}%`);
      return `(p.name ILIKE $${idx} OR p.brand ILIKE $${idx})`;
    });
    sql += ` AND (${orClauses.join(' OR ')})`;
  }
}
```

Apply the same change to the count query's search filter.

**Step 6: Verify both frontend and backend build**

Run: `npm run build && cd frontend && npm run build`
Expected: No errors

**Step 7: Commit**

```bash
git add frontend/src/pages/admin/Mapping.tsx frontend/src/services/api.ts src/repositories/CanonicalProductRepository.ts
git commit -m "feat: add bilingual search with auto-translation to mapping page"
```

---

### Task 5: Manual testing and polish

**Step 1: Set up Google Translate API key**

Add `GOOGLE_TRANSLATE_API_KEY=<your-key>` to `.env`.

To get a key: Google Cloud Console → APIs & Services → Credentials → Create API Key → Enable Cloud Translation API.

**Step 2: Start the application**

Run: `docker-compose up -d && npm run api`

**Step 3: Test unit filters**

1. Go to admin/mapping page
2. Select a country with products (e.g., Vietnam)
3. Select unit "kg" → verify products filter to only kg items
4. Enter quantity "1" → verify further filtering
5. Clear unit → verify all products return
6. Verify URL params update (`?unit=kg&unit_quantity=1`)
7. Verify page resets to 1 when filter changes

**Step 4: Test bilingual search**

1. Select Vietnam as country
2. Type "sugar" in search
3. Verify the search finds Vietnamese sugar products (e.g., "Đường trắng")
4. Type a Vietnamese term directly → verify it searches without translation
5. Verify combined search works: results include matches from both English and translated terms

**Step 5: Test edge cases**

1. Search with no country selected → no API calls
2. Translation API key missing → search still works with original term only (no crash)
3. Empty search → all products returned
4. Unit filter + search combined → both filters apply

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish mapping automation filters"
```
