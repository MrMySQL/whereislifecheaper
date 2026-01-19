# Plan: Extract Reusable Patterns from REWE Scraper

## Summary

Extract common patterns from ReweScraper (948 lines) into shared utilities that all scrapers can use. This reduces code duplication, improves maintainability, and provides a consistent approach for handling anti-bot protection across scrapers.

## File Structure

```
src/utils/
├── browser/                     # NEW
│   ├── index.ts
│   ├── types.ts
│   ├── stealthBrowser.ts        # Stealth browser launcher
│   └── cloudflare.ts            # Cloudflare Turnstile solver
├── parsers/                     # NEW
│   ├── index.ts
│   ├── types.ts
│   ├── priceParser.ts           # Locale-aware price parsing
│   └── unitParser.ts            # Locale-aware unit parsing
├── page/                        # NEW
│   ├── index.ts
│   ├── scrollLoader.ts          # Infinite scroll handler
│   ├── pagination.ts            # Pagination detection
│   └── cookieConsent.ts         # Cookie consent handlers
├── normalizer.ts                # EXISTING (no changes)
├── retry.ts                     # EXISTING (no changes)
└── logger.ts                    # EXISTING (no changes)
```

## Implementation Steps

### Phase 1: Browser Utilities (High Priority)

#### 1.1 Create `src/utils/browser/types.ts`
- `StealthBrowserOptions` interface (stealth, persistent, locale, timezone, geolocation, viewport)
- `StealthBrowserResult` interface (context, page, close)
- `CloudflareSolverOptions` interface (maxAttempts, waitBetweenAttempts, screenshotDir)
- `CloudflareSolverResult` interface (solved, attempts, error)

#### 1.2 Create `src/utils/browser/stealthBrowser.ts`
Extract from `ReweScraper.ts:124-172`:
- Use `playwright-extra` with `puppeteer-extra-plugin-stealth`
- Use `top-user-agents` for realistic user agent rotation
- Support persistent browser context for session management
- Configurable locale, timezone, geolocation
- Randomized viewport (1920±100 x 1080±50)

```typescript
export async function launchStealthBrowser(options: StealthBrowserOptions): Promise<StealthBrowserResult>
export function getRandomUserAgent(): string
```

#### 1.3 Create `src/utils/browser/cloudflare.ts`
Extract from `ReweScraper.ts:178-299`:
- Detect Cloudflare challenge via page title
- Multiple iframe selectors for Turnstile widget
- Human-like checkbox clicking with random offsets
- Debug screenshots for troubleshooting
- Configurable retry attempts

```typescript
export async function detectCloudflareChallenge(page: Page): Promise<boolean>
export async function solveCloudflareChallenge(page: Page, options?: CloudflareSolverOptions): Promise<CloudflareSolverResult>
```

### Phase 2: Parser Utilities (High Priority)

#### 2.1 Create `src/utils/parsers/types.ts`
- `Locale` type: `'de-DE' | 'es-ES' | 'uk-UA' | 'ru-RU' | 'sr-Latn-ME' | 'kk-KZ' | 'tr-TR'`
- `ParsedUnit` interface: `{ unit?, quantity? }`
- `PriceParserOptions` interface: locale, currencySymbol, currencyCode
- `UnitParserOptions` interface: locale, normalizeToStandard

#### 2.2 Create `src/utils/parsers/priceParser.ts`
Complement existing `normalizer.ts:parsePrice()` with locale awareness:
- German: "1.234,56 €" (comma decimal, dot thousands)
- Turkish: "1.234,56 ₺"
- Ukrainian: "123,45 грн"

```typescript
export function parseLocalizedPrice(priceString: string, options?: PriceParserOptions): number | null
export function extractPrices(text: string, options?: PriceParserOptions): number[]
```

#### 2.3 Create `src/utils/parsers/unitParser.ts`
Extract from `ReweScraper.ts:859-922` and generalize:
- German: "6 x 1,5 l", "500 g", "Stück"
- Spanish: "12 unidades", "500 gramos"
- Turkish: "500 gr", "6 adet"
- Normalize to standard units (g→kg if ≥1000, ml→l if ≥1000)

```typescript
export function parseLocalizedUnit(text: string, options?: UnitParserOptions): ParsedUnit
```

### Phase 3: Page Utilities (Medium Priority)

#### 3.1 Create `src/utils/page/scrollLoader.ts`
Extract from `ReweScraper.ts:678-713`:
- Scroll until element count stabilizes
- Configurable maxScrolls, noChangeThreshold, scrollWait

```typescript
export async function scrollToLoadAll(page: Page, options: ScrollLoaderOptions): Promise<ScrollLoaderResult>
```

#### 3.2 Create `src/utils/page/pagination.ts`
Extract from `ReweScraper.ts:609-673`:
- Detect total pages from pagination nav
- Support query params (?page=N) and path patterns (/page-N/)

```typescript
export async function detectTotalPages(page: Page, options?: PaginationOptions): Promise<number>
export function buildPageUrl(baseUrl: string, pageNumber: number, options?: PaginationOptions): string
```

#### 3.3 Create `src/utils/page/cookieConsent.ts`
Common cookie consent handlers:
- Default selectors for major consent libraries (OneTrust, CookieBot, etc.)
- Multi-language support (German, English, Spanish, Ukrainian, etc.)

```typescript
export async function handleCookieConsent(page: Page, options?: CookieConsentOptions): Promise<boolean>
```

### Phase 4: BaseScraper Integration (Medium Priority)

Add optional helper methods to `src/scrapers/base/BaseScraper.ts`:

```typescript
// New protected methods (opt-in usage)
protected async launchWithStealth(): Promise<void>
protected async handleCloudflareIfPresent(): Promise<boolean>
protected async scrollToLoadAll(options: ScrollLoaderOptions): Promise<ScrollLoaderResult>
protected async detectTotalPages(options?: PaginationOptions): Promise<number>
protected async handleCookieConsent(customSelectors?: string[]): Promise<boolean>
protected parsePrice(priceString: string): number | null  // Uses config.locale
protected parseUnit(unitString: string): ParsedUnit       // Uses config.locale
```

Update `src/types/scraper.types.ts` to add:
```typescript
interface ScraperConfig {
  // ... existing fields
  browserMode?: 'standard' | 'stealth' | 'persistent';
  locale?: string;
  timezone?: string;
  geolocation?: { latitude: number; longitude: number };
}
```

### Phase 5: REWE Refactor (Optional)

Refactor `ReweScraper.ts` to use new utilities:
- Replace `launchStealthBrowser()` with utility call
- Replace `solveCloudflareChallenge()` with utility call
- Replace `parseUnit()` with `parseLocalizedUnit()`
- Replace price parsing with `parseLocalizedPrice()`

## Files to Modify/Create

| File | Action | Lines Est. |
|------|--------|------------|
| `src/utils/browser/types.ts` | Create | ~50 |
| `src/utils/browser/stealthBrowser.ts` | Create | ~100 |
| `src/utils/browser/cloudflare.ts` | Create | ~120 |
| `src/utils/browser/index.ts` | Create | ~5 |
| `src/utils/parsers/types.ts` | Create | ~30 |
| `src/utils/parsers/priceParser.ts` | Create | ~80 |
| `src/utils/parsers/unitParser.ts` | Create | ~100 |
| `src/utils/parsers/index.ts` | Create | ~10 |
| `src/utils/page/scrollLoader.ts` | Create | ~60 |
| `src/utils/page/pagination.ts` | Create | ~80 |
| `src/utils/page/cookieConsent.ts` | Create | ~60 |
| `src/utils/page/index.ts` | Create | ~5 |
| `src/scrapers/base/BaseScraper.ts` | Modify | +50 |
| `src/types/scraper.types.ts` | Modify | +10 |

## Dependencies

New npm packages needed:
- `playwright-extra` - Already in package.json (used by REWE)
- `puppeteer-extra-plugin-stealth` - Already in package.json (used by REWE)
- `top-user-agents` - Already in package.json (used by REWE)

## Verification

1. **Unit Tests**: Create tests for each utility function
   ```bash
   npm test -- --grep "browser utilities"
   npm test -- --grep "parser utilities"
   ```

2. **REWE Scraper Test**: Verify REWE still works after refactor
   ```bash
   npm run scraper:test -- --scraper rewe
   ```

3. **Build Check**: Ensure TypeScript compiles
   ```bash
   npm run build
   ```

4. **Integration Test**: Run full scrape for a single category
   ```bash
   npm run scraper:run -- --scraper rewe --categories obst-gemuese
   ```

## Notes

- All utilities are **opt-in** - existing scrapers continue to work unchanged
- Utilities are designed to be **composable** - use what you need
- **No breaking changes** to BaseScraper or existing scrapers
- Each utility includes proper TypeScript types and JSDoc documentation
