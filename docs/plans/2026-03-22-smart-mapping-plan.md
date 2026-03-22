# Smart Canonical Product Mapping - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Speed up canonical product mapping by adding unit/weight filters, Google Translate integration, and a "Find matches" smart suggest button that auto-fills search filters.

**Architecture:** Three independent backend additions (unit filter params, translate endpoint, language_code migration) feed into one frontend feature (smart suggest on the Mapping page). The translate endpoint wraps Google Cloud Translation API with in-memory caching. The frontend orchestrates: parse canonical name -> translate -> set filters -> show results.

**Tech Stack:** Node.js/TypeScript backend (Express), React frontend (TanStack Query), PostgreSQL, Google Cloud Translation API v2.

---

### Task 1: Add `language_code` column to countries table

**Files:**
- Create: `src/database/migrations/015_add_language_code_to_countries.sql`
- Modify: `src/database/seeds/countries.ts`

**Step 1: Create migration file**

```sql
-- Migration: Add language_code to countries
-- Description: Stores ISO 639-1 language code for translation support

ALTER TABLE countries ADD COLUMN IF NOT EXISTS language_code VARCHAR(5);

UPDATE countries SET language_code = CASE code
  WHEN 'TR' THEN 'tr'
  WHEN 'ME' THEN 'sr'
  WHEN 'ES' THEN 'es'
  WHEN 'UZ' THEN 'uz'
  WHEN 'UA' THEN 'uk'
  WHEN 'KZ' THEN 'ru'
  WHEN 'DE' THEN 'de'
  WHEN 'MY' THEN 'ms'
  WHEN 'AL' THEN 'sq'
  WHEN 'AT' THEN 'de'
  WHEN 'RU' THEN 'ru'
  WHEN 'VN' THEN 'vi'
  WHEN 'RO' THEN 'ro'
  WHEN 'IT' THEN 'it'
END;

COMMENT ON COLUMN countries.language_code IS 'ISO 639-1 language code for product name translation';
```

**Step 2: Update seed data**

In `src/database/seeds/countries.ts`, add `language_code` to the `CountrySeedData` interface and each entry. Update the INSERT query to include `language_code`.

**Step 3: Run migration**

Run: `npm run migrate`
Expected: Migration 015 applied successfully.

**Step 4: Update Country type on frontend**

In `frontend/src/types/index.ts`, add `language_code: string | null` to the `Country` interface.

**Step 5: Commit**

```bash
git add src/database/migrations/015_add_language_code_to_countries.sql src/database/seeds/countries.ts frontend/src/types/index.ts
git commit -m "feat: add language_code column to countries table for translation support"
```

---

### Task 2: Add unit/weight filter to products-by-country API

**Files:**
- Modify: `src/api/routes/canonical.ts:21-26` (productsByCountrySchema)
- Modify: `src/repositories/CanonicalProductRepository.ts:321-400` (getProductsByCountry)

**Step 1: Add `unit` and `unit_quantity` params to validation schema**

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

**Step 2: Pass new params through the route handler**

In the `GET /products-by-country/:countryId` handler (~line 250), extract and pass `unit` and `unit_quantity`:

```typescript
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
```

**Step 3: Add filter logic in repository**

In `CanonicalProductRepository.getProductsByCountry`, update the `filters` type and add SQL clauses:

```typescript
async getProductsByCountry(
  countryId: string,
  filters: { search?: string; supermarketId?: string; mappedOnly?: boolean; unit?: string; unitQuantity?: number },
  pagination: { limit: number; offset: number }
): Promise<{ data: CountryProductEntry[]; total: number }> {
```

Add after existing filter clauses (both in data and count queries):

```typescript
if (filters.unit) {
  sql += ` AND p.unit ILIKE $${i}`;
  params.push(filters.unit);
  i++;
}
if (filters.unitQuantity !== undefined) {
  sql += ` AND p.unit_quantity = $${i}`;
  params.push(filters.unitQuantity);
  i++;
}
```

Do the same for the count query section.

**Step 4: Verify build compiles**

Run: `npm run build:backend`
Expected: Compiles with no errors.

**Step 5: Commit**

```bash
git add src/api/routes/canonical.ts src/repositories/CanonicalProductRepository.ts
git commit -m "feat: add unit and unit_quantity filter params to products-by-country API"
```

---

### Task 3: Add distinct units endpoint

**Files:**
- Modify: `src/api/routes/canonical.ts`
- Modify: `src/repositories/CanonicalProductRepository.ts`

**Step 1: Add repository method**

Add to `CanonicalProductRepository`:

```typescript
async getDistinctUnits(countryId: string, supermarketId?: string): Promise<string[]> {
  let sql = `
    SELECT DISTINCT p.unit
    FROM products p
    INNER JOIN product_mappings pm ON p.id = pm.product_id
    INNER JOIN supermarkets s ON pm.supermarket_id = s.id
    WHERE s.country_id = $1 AND p.unit IS NOT NULL AND p.unit != ''
  `;
  const params: unknown[] = [countryId];

  if (supermarketId) {
    sql += ` AND s.id = $2`;
    params.push(parseInt(supermarketId, 10));
  }

  sql += ` ORDER BY p.unit`;
  const result = await query<{ unit: string }>(sql, params);
  return result.rows.map(r => r.unit);
}
```

**Step 2: Add route**

Add in `canonical.ts` before the `/:id` routes (to avoid param conflict):

```typescript
router.get('/products-by-country/:countryId/units', async (req, res, next) => {
  try {
    const { countryId } = req.params;
    const { supermarket_id } = req.query;
    const data = await canonicalProductRepository.getDistinctUnits(
      countryId,
      typeof supermarket_id === 'string' ? supermarket_id : undefined
    );
    res.json({ data });
  } catch (error) {
    next(error);
  }
});
```

**Step 3: Add frontend API method**

In `frontend/src/services/api.ts`, add to `canonicalApi`:

```typescript
getDistinctUnits: async (countryId: number, supermarketId?: number): Promise<string[]> => {
  const params = supermarketId ? { supermarket_id: supermarketId } : {};
  const response = await api.get<{ data: string[] }>(`/canonical/products-by-country/${countryId}/units`, { params });
  return response.data.data;
},
```

**Step 4: Verify build compiles**

Run: `npm run build:backend`
Expected: Compiles with no errors.

**Step 5: Commit**

```bash
git add src/api/routes/canonical.ts src/repositories/CanonicalProductRepository.ts frontend/src/services/api.ts
git commit -m "feat: add endpoint to get distinct product units per country"
```

---

### Task 4: Create translate API endpoint

**Files:**
- Create: `src/api/routes/translate.ts`
- Modify: `src/api/server.ts` (register route)

**Step 1: Install Google Translate dependency**

Run: `npm install @google-cloud/translate`

**Step 2: Create translate route**

Create `src/api/routes/translate.ts`:

```typescript
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

  const { Translate } = await import('@google-cloud/translate');
  const translate = new Translate({ key: apiKey });
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
```

**Step 3: Register route in server.ts**

In `src/api/server.ts`, add import and route registration:

```typescript
import translateRouter from './routes/translate';
// ...
app.use('/api/translate', translateRouter);
```

Add the import alongside the other route imports, and the `app.use` line alongside the other route registrations (before the 404 handler).

**Step 4: Verify build compiles**

Run: `npm run build:backend`
Expected: Compiles with no errors.

**Step 5: Add frontend API method**

In `frontend/src/services/api.ts`, add:

```typescript
// Translation API
export const translateApi = {
  translate: async (text: string, target: string): Promise<{ original: string; translated: string; target_language: string }> => {
    const response = await api.get<{ original: string; translated: string; target_language: string }>('/translate', {
      params: { text, target },
    });
    return response.data;
  },
};
```

**Step 6: Commit**

```bash
git add src/api/routes/translate.ts src/api/server.ts frontend/src/services/api.ts package.json package-lock.json
git commit -m "feat: add Google Translate API endpoint with in-memory caching"
```

---

### Task 5: Add unit/weight filter UI to Mapping page

**Files:**
- Modify: `frontend/src/pages/admin/Mapping.tsx`

**Step 1: Add state and query for units**

Add after existing state declarations (~line 48):

```typescript
const [unitFilter, setUnitFilter] = useState('');
const [unitQuantityFilter, setUnitQuantityFilter] = useState('');
```

Add query for distinct units (after the supermarkets query):

```typescript
const { data: distinctUnits = [] } = useQuery({
  queryKey: ['distinctUnits', selectedCountryId, selectedSupermarketId],
  queryFn: () => canonicalApi.getDistinctUnits(selectedCountryId!, selectedSupermarketId || undefined),
  enabled: !!selectedCountryId,
});
```

**Step 2: Pass filter params to API call**

Update the products query (~line 109) to include unit params:

```typescript
queryKey: ['products', selectedCountryId, selectedSupermarketId, productSearch, productPage, mappedOnly, unitFilter, unitQuantityFilter],
queryFn: () =>
  selectedCountryId
    ? canonicalApi.getProductsByCountry(selectedCountryId, {
        search: productSearch || undefined,
        supermarket_id: selectedSupermarketId || undefined,
        mapped_only: mappedOnly || undefined,
        unit: unitFilter || undefined,
        unit_quantity: unitQuantityFilter ? Number(unitQuantityFilter) : undefined,
        limit: PRODUCTS_PER_PAGE,
        offset: productPage * PRODUCTS_PER_PAGE,
      })
    : Promise.resolve({ data: [], count: 0 }),
```

**Step 3: Update `canonicalApi.getProductsByCountry` params type**

In `frontend/src/services/api.ts`, update the params type:

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
```

**Step 4: Add filter UI elements**

Add after the supermarket selector in the filters row (~line 484), before the product search input:

```tsx
{/* Unit filter */}
{selectedCountryId && distinctUnits.length > 0 && (
  <div className="sm:w-32">
    <select
      value={unitFilter}
      onChange={(e) => {
        setUnitFilter(e.target.value);
        setPageInUrl(0);
      }}
      className="input h-12 py-0"
    >
      <option value="">{t('mapping.allUnits')}</option>
      {distinctUnits.map((unit: string) => (
        <option key={unit} value={unit}>{unit}</option>
      ))}
    </select>
  </div>
)}

{/* Unit quantity filter */}
{selectedCountryId && unitFilter && (
  <div className="sm:w-24">
    <input
      type="number"
      min="0"
      step="any"
      placeholder={t('mapping.qty')}
      value={unitQuantityFilter}
      onChange={(e) => {
        setUnitQuantityFilter(e.target.value);
        setPageInUrl(0);
      }}
      className="input h-12 py-0"
    />
  </div>
)}
```

**Step 5: Reset filters on country change**

In `handleCountryChange`, add:

```typescript
setUnitFilter('');
setUnitQuantityFilter('');
```

**Step 6: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add frontend/src/pages/admin/Mapping.tsx frontend/src/services/api.ts
git commit -m "feat: add unit/weight filter UI to mapping page"
```

---

### Task 6: Add Smart Suggest to Mapping page

**Files:**
- Modify: `frontend/src/pages/admin/Mapping.tsx`

This is the largest task. It adds a "Find matches" button to each canonical product in the manage section, and a suggestion banner above the product table.

**Step 1: Add smart suggest state**

Add after existing state declarations:

```typescript
const [suggestingFor, setSuggestingFor] = useState<CanonicalProductBasic | null>(null);
const [suggestSearchTerm, setSuggestSearchTerm] = useState('');
const [isTranslating, setIsTranslating] = useState(false);
```

**Step 2: Add the canonical name parser utility**

Add before the `Mapping` component:

```typescript
function parseCanonicalName(name: string): { searchTerm: string; unit: string | null; quantity: number | null } {
  const unitMatch = name.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pcs|pieces|pack)/i);
  if (!unitMatch) {
    return { searchTerm: name.trim(), unit: null, quantity: null };
  }

  const quantity = parseFloat(unitMatch[1]);
  let unit = unitMatch[2].toLowerCase();
  // Normalize unit names
  if (unit === 'pieces') unit = 'pcs';
  if (unit === 'l') unit = 'L';
  if (unit === 'ml') unit = 'mL';

  const searchTerm = name.substring(0, unitMatch.index).trim();
  return { searchTerm, unit, quantity };
}
```

**Step 3: Add the handleSmartSuggest function**

Add inside the `Mapping` component:

```typescript
const selectedCountry = countries.find((c: Country) => c.id === selectedCountryId);

const handleSmartSuggest = async (cp: CanonicalProductBasic) => {
  if (!selectedCountryId || !selectedCountry?.language_code) return;

  const { searchTerm, unit, quantity } = parseCanonicalName(cp.name);

  setSuggestingFor(cp);
  setIsTranslating(true);

  try {
    // Translate the search term to the country's language
    const { translated } = await translateApi.translate(searchTerm, selectedCountry.language_code);
    setSuggestSearchTerm(translated);

    // Auto-fill all filters
    setProductSearchInput(translated);
    setProductSearch(translated);
    if (unit) setUnitFilter(unit);
    if (quantity) setUnitQuantityFilter(String(quantity));
    setMappedOnly(false);
    setPageInUrl(0);

    updateUrlParams((params) => {
      params.set('search', translated);
      params.delete('page');
    });
  } catch {
    // If translation fails, use the original English term
    setSuggestSearchTerm(searchTerm);
    setProductSearchInput(searchTerm);
    setProductSearch(searchTerm);
    updateUrlParams((params) => {
      params.set('search', searchTerm);
      params.delete('page');
    });
  } finally {
    setIsTranslating(false);
  }
};

const clearSuggestion = () => {
  setSuggestingFor(null);
  setSuggestSearchTerm('');
  setProductSearchInput('');
  setProductSearch('');
  setUnitFilter('');
  setUnitQuantityFilter('');
  setMappedOnly(false);
  setPageInUrl(0);
  updateUrlParams((params) => {
    params.delete('search');
    params.delete('page');
  });
};
```

**Step 4: Add "Find matches" button to each canonical product row**

In the manage section, find the canonical product row's action buttons area (where the EyeOff toggle, per-unit toggle, and delete button are). Add a "Find matches" button before them:

```tsx
{/* Find matches button */}
{selectedCountryId && selectedCountry?.language_code && (
  <button
    onClick={() => handleSmartSuggest(cp)}
    disabled={isTranslating}
    className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
    title={t('mapping.findMatches')}
  >
    <Search className="h-4 w-4" />
  </button>
)}
```

**Step 5: Add suggestion banner above product table**

Add just before the `{/* Products Table */}` comment (~line 516):

```tsx
{/* Smart Suggest Banner */}
{suggestingFor && (
  <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
    <div className="text-sm text-blue-800">
      <span>{t('mapping.suggestingFor')} </span>
      <strong>{suggestingFor.name}</strong>
      {suggestSearchTerm && (
        <span className="text-blue-600"> ({t('mapping.searched')}: "{suggestSearchTerm}")</span>
      )}
    </div>
    <button
      onClick={clearSuggestion}
      className="flex-shrink-0 p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors"
    >
      <X className="h-4 w-4" />
    </button>
  </div>
)}
```

**Step 6: Add translateApi import**

At the top of `Mapping.tsx`, update the import:

```typescript
import { countriesApi, canonicalApi, supermarketsApi, translateApi } from '../../services/api';
```

**Step 7: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add frontend/src/pages/admin/Mapping.tsx
git commit -m "feat: add smart suggest with translation to mapping page"
```

---

### Task 7: Add i18n translation keys

**Files:**
- Modify: frontend i18n translation files (all languages that have mapping keys)

**Step 1: Find and update translation files**

Search for existing `mapping.` keys in i18n files and add:

```json
{
  "mapping": {
    "allUnits": "All units",
    "qty": "Qty",
    "findMatches": "Find matches",
    "suggestingFor": "Suggesting matches for",
    "searched": "searched"
  }
}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add frontend/src/i18n/
git commit -m "feat: add i18n keys for unit filter and smart suggest"
```

---

### Task 8: Final integration test

**Step 1: Verify backend builds**

Run: `npm run build:backend`
Expected: Compiles with no errors.

**Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 3: Run migration on local database**

Run: `npm run migrate`
Expected: Migration 015 applied.

**Step 4: Commit everything**

If any uncommitted changes remain, commit them.
