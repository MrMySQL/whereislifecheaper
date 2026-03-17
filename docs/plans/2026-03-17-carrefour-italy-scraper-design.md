# Carrefour Italy Scraper Design

## Overview

Add an API-based scraper for Carrefour Italy (carrefour.it) to enable grocery price comparison for Italy. The site runs on Salesforce Commerce Cloud (Demandware) and exposes a JSON API that returns structured product data without authentication.

## Architecture

**Type:** API-based scraper (no browser needed)
**Model:** Similar to `AuchanUaGraphQLScraper` — direct HTTP requests, no Playwright browser overhead.

### API Endpoint

```
GET https://www.carrefour.it/on/demandware.store/Sites-carrefour-IT-Site/it_IT/Search-ShowAjax
  ?cgid={categoryId}&start={offset}&sz=25&pmin=0,01
```

- Returns JSON with `productIds[]` array and `countResult` for total count
- Pagination via `start` (offset) and `sz` (page size, default 25)
- `pmin=0,01` filters out zero-price items
- No authentication or cookies required

### Data Mapping

| API Field | ProductData Field | Notes |
|---|---|---|
| `id` | `externalId` | Unique product identifier |
| `productName` | `name` | Full product name |
| `brand` | `brand` | Brand name |
| `price.sales.value` | `price` | Current selling price in EUR |
| `price.list.value` | `originalPrice` | List price (when on sale) |
| `unitPrice.sales.value` | `pricePerUnit` | Price per unit (kg/l) |
| `unitData.unit` | `unit` | Unit type (kg, l, pz) |
| `unitData.value` | `unitQuantity` | Package quantity |
| `impression.dimension52` | — | Fallback for package size parsing |
| `available` | `isAvailable` | Stock availability |
| `primaryCategory` | `categoryName` | Product category |
| `discountPercentage` | — | Used to determine `isOnSale` |
| Currency | `currency` | Always `EUR` |

### Categories (14 food categories)

| cgid | Name |
|---|---|
| `frutta` | Frutta e verdura |
| `carne` | Carne |
| `pesce` | Pesce |
| `salumi-e-formaggi` | Formaggi e salumi |
| `gastronomia` | Gastronomia |
| `uova-latte-e-latticini` | Uova, latte e latticini |
| `dolci-e-prima-colazione` | Dolci e prima colazione |
| `acqua-e-analcolici` | Acqua, succhi e bibite |
| `pasta-riso-e-farina` | Pasta, riso e farina |
| `condimenti-e-conserve` | Condimenti e conserve |
| `pane-e-snack-salati` | Pane e snack salati |
| `gelati-e-surgelati` | Surgelati e gelati |
| `birra-vino-e-liquori` | Birra, vino e liquori |
| `stili-alimentari` | Stili alimentari |

## Files to Create/Modify

1. **New:** `src/scrapers/italy/CarrefourItScraper.ts` — scraper class extending BaseScraper
2. **Modify:** `src/scrapers/scraperRegistry.ts` — register CarrefourItScraper
3. **Modify:** `src/database/seeds/countries.ts` — add Italy (code: IT, currency: EUR)
4. **Modify:** `src/database/seeds/supermarkets.ts` — add Carrefour Italy entry

## No Exchange Rate Change Needed

Italy uses EUR, which is the base currency (rate = 1). No changes to `exchangeRates.ts`.

## Risks & Mitigations

- **Rate limiting:** Use delays between requests (1-2s between pages). The API currently has no visible rate limiting.
- **Session/cookie requirements:** If the API starts requiring cookies, fall back to browser context + API interception (like MigrosScraper).
- **Store-specific pricing:** The API uses `storeId=0415` by default. Prices may vary by store — we accept the default store's pricing.
