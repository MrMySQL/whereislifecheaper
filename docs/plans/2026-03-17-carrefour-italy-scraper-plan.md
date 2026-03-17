# Carrefour Italy Scraper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an API-based scraper for Carrefour Italy (carrefour.it) to enable Italian grocery price comparison.

**Architecture:** Direct HTTP GET requests to the Demandware `Search-ShowAjax` JSON API. No browser needed. Extends `BaseScraper`, modeled after `AuchanUaGraphQLScraper`. Paginated fetching (25 products/page) across 14 food categories.

**Tech Stack:** TypeScript, Node.js `https` module, BaseScraper abstract class, retry utility.

**Design doc:** `docs/plans/2026-03-17-carrefour-italy-scraper-design.md`

---

### Task 1: Add Italy to country seed data

**Files:**
- Modify: `src/database/seeds/countries.ts`

**Step 1: Add Italy entry to countriesData array**

Add after the Romania entry (line 88):

```typescript
  {
    name: 'Italy',
    code: 'IT',
    currency_code: 'EUR',
    flag_emoji: '\u{1F1EE}\u{1F1F9}',
  },
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/database/seeds/countries.ts
git commit -m "feat: add Italy to country seed data"
```

---

### Task 2: Add Carrefour Italy to supermarket seed data

**Files:**
- Modify: `src/database/seeds/supermarkets.ts`

**Step 1: Add Carrefour Italy entry to supermarketsData array**

Add after the Sezamo (Romania) entry:

```typescript
  // Italy
  {
    country_code: 'IT',
    name: 'Carrefour',
    website_url: 'https://www.carrefour.it',
    scraper_class: 'CarrefourItScraper',
    is_active: true,
  },
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/database/seeds/supermarkets.ts
git commit -m "feat: add Carrefour Italy to supermarket seed data"
```

---

### Task 3: Create the CarrefourItScraper class

**Files:**
- Create: `src/scrapers/italy/CarrefourItScraper.ts`

**Step 1: Create the scraper file**

Create `src/scrapers/italy/CarrefourItScraper.ts` with the full implementation. Key design decisions:

- Extends `BaseScraper`
- Uses Node.js `https` module for direct API calls (no browser)
- API endpoint: `GET /on/demandware.store/Sites-carrefour-IT-Site/it_IT/Search-ShowAjax?cgid={id}&start={offset}&sz={pageSize}&pmin=0%2C01`
- Page size: 25 (matches site default)
- Sequential pagination (not parallel — conservative to avoid rate limiting)
- Currency: always EUR

Response type interface for the Demandware API:

```typescript
interface DemandwareProduct {
  uuid: string;
  id: string;
  productName: string;
  brand: string;
  productType: string;
  price: {
    sales?: { value: number; currency: string; formatted: string; decimalPrice: string };
    list?: { value: number; currency: string; formatted: string; decimalPrice: string };
  };
  unitPrice?: {
    sales?: { value: number; currency: string; formatted: string; decimalPrice: string };
  };
  unitData?: {
    unit: string;
    unitLaw: string;
    value: string;
    conversion: string;
  };
  available: boolean;
  isFood: boolean;
  primaryCategory: string;
  primaryCategoryName: string;
  discountPercentage: string;
  variableWeight: boolean;
  impression: {
    name: string;
    id: string;
    price: string;
    brand: string;
    category: string;
    dimension52: string;  // package size e.g. "0.85 kg"
    dimension53: string;  // "food" or "non_food"
  };
}

interface DemandwareSearchResponse {
  productIds: DemandwareProduct[];
  countResult: number;
  countResultLabel: string;
}
```

Category configuration (14 food categories exported as `carrefourItCategories`):

```typescript
export const carrefourItCategories: CategoryConfig[] = [
  { id: 'frutta', name: 'Frutta e verdura', url: '/spesa-online/frutta-e-verdura/frutta/' },
  { id: 'carne', name: 'Carne', url: '/spesa-online/carne/' },
  { id: 'pesce', name: 'Pesce', url: '/spesa-online/pesce/' },
  { id: 'salumi-e-formaggi', name: 'Formaggi e salumi', url: '/spesa-online/salumi-e-formaggi/' },
  { id: 'gastronomia', name: 'Gastronomia', url: '/spesa-online/gastronomia/' },
  { id: 'uova-latte-e-latticini', name: 'Uova, latte e latticini', url: '/spesa-online/uova-latte-e-latticini/' },
  { id: 'dolci-e-prima-colazione', name: 'Dolci e prima colazione', url: '/spesa-online/dolci-e-prima-colazione/' },
  { id: 'acqua-e-analcolici', name: 'Acqua, succhi e bibite', url: '/spesa-online/acqua-e-analcolici/' },
  { id: 'pasta-riso-e-farina', name: 'Pasta, riso e farina', url: '/spesa-online/pasta-riso-e-farina/' },
  { id: 'condimenti-e-conserve', name: 'Condimenti e conserve', url: '/spesa-online/condimenti-e-conserve/' },
  { id: 'pane-e-snack-salati', name: 'Pane e snack salati', url: '/spesa-online/pane-e-snack-salati/' },
  { id: 'gelati-e-surgelati', name: 'Surgelati e gelati', url: '/spesa-online/gelati-e-surgelati/' },
  { id: 'birra-vino-e-liquori', name: 'Birra, vino e liquori', url: '/spesa-online/birra-vino-e-liquori/' },
  { id: 'stili-alimentari', name: 'Stili alimentari', url: '/spesa-online/stili-alimentari/' },
];
```

Scraper config (exported as `carrefourItConfig`):

```typescript
export const carrefourItConfig: Partial<ScraperConfig> = {
  name: 'Carrefour Italy',
  baseUrl: 'https://www.carrefour.it',
  categories: carrefourItCategories,
  selectors: {
    productCard: '',
    productName: '',
    productPrice: '',
  },
  waitTimes: {
    pageLoad: 0,
    dynamicContent: 0,
    betweenRequests: 1500,
    betweenPages: 500,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};
```

The `CarrefourItScraper` class methods:

- `initialize()`: Log initialization, set `startTime`. No browser needed.
- `scrapeCategory(category)`: Fetch first page to get `countResult`, then loop through all pages sequentially. Use `onPageScraped` callback for incremental saves.
- `fetchPage(cgid, start, sz)`: HTTP GET to the Search-ShowAjax endpoint. Returns parsed `DemandwareSearchResponse`. Wrapped in `retry()`.
- `transformProduct(item)`: Map `DemandwareProduct` to `ProductData`. Parse `unitData` for unit/quantity. Use `extractQuantity()` from normalizer as fallback via `impression.dimension52`. Build product URL as `https://www.carrefour.it/p/{id}.html`. Determine `isOnSale` from `discountPercentage`.
- `scrapeProductDetails()`: Throw — not needed, all data comes from list API.
- `cleanup()`: Log stats.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/scrapers/italy/CarrefourItScraper.ts
git commit -m "feat: add Carrefour Italy API scraper"
```

---

### Task 4: Register the scraper in the registry

**Files:**
- Modify: `src/scrapers/scraperRegistry.ts`

**Step 1: Add import**

Add after the SezamoScraper import (line 22):

```typescript
import { CarrefourItScraper, carrefourItConfig, carrefourItCategories } from './italy/CarrefourItScraper';
```

**Step 2: Add registry entry**

Add to the `SCRAPER_REGISTRY` Map after the SezamoScraper entry:

```typescript
  [
    'CarrefourItScraper',
    {
      className: 'CarrefourItScraper',
      scraperClass: CarrefourItScraper,
      defaultConfig: carrefourItConfig,
      categories: carrefourItCategories,
    },
  ],
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/scrapers/scraperRegistry.ts
git commit -m "feat: register CarrefourItScraper in scraper registry"
```

---

### Task 5: Build and test the scraper

**Step 1: Full build**

Run: `npm run build`
Expected: Successful compilation, no errors

**Step 2: Test scraper manually**

Run: `npm run scraper:test -- CarrefourItScraper`

Expected: Scraper initializes, fetches products from at least one category, logs product counts. Look for:
- "Initializing Carrefour Italy scraper..."
- Product counts per category page
- No HTTP errors or timeouts
- Products with valid names, prices > 0, EUR currency

**Step 3: Commit (if any fixes were needed)**

```bash
git commit -am "fix: adjustments from scraper testing"
```

---

### Task 6: Final verification

**Step 1: Run full build**

Run: `npm run build`
Expected: Clean compilation

**Step 2: Verify all registered scrapers still work**

Run: `npx ts-node -e "const { getRegisteredScraperNames } = require('./src/scrapers/scraperRegistry'); console.log(getRegisteredScraperNames());"`

Expected: Array includes `'CarrefourItScraper'` among all other scrapers.

**Step 3: Final commit if needed, then done**
