# Smart Canonical Product Mapping

## Problem

Mapping canonical products to supermarket-specific products is slow and manual:
1. Must manually translate canonical product names to local languages (separate browser tab)
2. No unit/weight filter means browsing 100+ results to find a 1kg product
3. Each canonical product requires repeating this search-translate-browse cycle per country

## Solution

Frontend-driven approach: a translate endpoint + unit filters on the existing API + client-side scoring. Three features that work together to reduce the mapping workflow from minutes to seconds per product.

### Feature 1: Unit/Weight Filter

Add two filter controls to the mapping page filters row:
- **Unit type dropdown**: populated from distinct `unit` values in the selected country's products (e.g., kg, L, g, mL, pcs)
- **Quantity input**: numeric field for unit_quantity

Backend changes:
- Add `unit` and `unit_quantity` query params to `GET /canonical/products-by-country/:countryId`
- Add `GET /canonical/products-by-country/:countryId/units` to fetch distinct unit values for populating the dropdown

### Feature 2: Google Translate Integration

Translate canonical product names to the local language automatically.

Backend changes:
- New endpoint: `GET /api/translate?text=Sugar&target=vi` — calls Google Cloud Translation API
- New migration: add `language_code` column to `countries` table (e.g., "vi", "tr", "de")
- Seed update: populate language codes for all existing countries
- In-memory cache (Map keyed by `text+target`) so repeated lookups are free
- Env var: `GOOGLE_TRANSLATE_API_KEY`
- Response: `{ original, translated, target_language }`

### Feature 3: Smart Suggest ("Find matches" button)

A "Find matches" button (search icon) on each canonical product in the Manage section.

Workflow:
1. User selects a country and opens "Manage Canonical Products" section
2. Each canonical product shows a "Find matches" button (search icon)
3. Clicking it:
   - Parses unit info from the canonical name via client-side regex
   - Calls `GET /api/translate` to translate food keywords to the country's language
   - Auto-fills the product search box with the translated term
   - Auto-sets the unit filter to the parsed unit/quantity
   - Sets "Mapped Only" to false (want unmapped products)
4. A banner shows above the product table: "Suggesting matches for **White Sugar 1kg** (searched: Duong trang)" with a Clear button
5. Results are scored and sorted client-side by confidence (colored dots: green >70%, yellow 40-70%, gray <40%)
6. User links the correct product using the existing canonical dropdown
7. Clicking Clear or another "Find matches" resets all auto-filled filters

What does NOT change:
- The linking mechanism (canonical dropdown per product row)
- No automatic linking — every match is human-approved
- Existing manual search/filter workflow works independently

## Technical Details

### Canonical name parsing (client-side)

Extract unit info from canonical product names like "White Sugar 1kg", "Milk 1L", "Eggs 10pcs":
- Regex: `/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pcs|pieces|pack)/i`
- Search term: everything before the unit match, trimmed
- If no match (e.g., "Olive Oil"): skip unit filter, only use translated name

Examples:
```
parseCanonicalName("White Sugar 1kg")  -> { searchTerm: "White Sugar", unit: "kg", quantity: 1 }
parseCanonicalName("Eggs 10pcs")       -> { searchTerm: "Eggs", unit: "pcs", quantity: 10 }
parseCanonicalName("Olive Oil")        -> { searchTerm: "Olive Oil", unit: null, quantity: null }
```

### Client-side scoring

After results return, sort by a combined score:
- **Fuzzy name match (40%)** — how well translated term matches product name (includes/startsWith)
- **Unit exact match (30%)** — unit and quantity match exactly
- **Category match (20%)** — same category as canonical product
- **Price plausibility (10%)** — price within 2 standard deviations of mean for that unit in the country

### Countries language_code mapping

| Country | Code | Language Code |
|---------|------|---------------|
| Turkey | TR | tr |
| Montenegro | ME | sr |
| Spain | ES | es |
| Uzbekistan | UZ | uz |
| Ukraine | UA | uk |
| Kazakhstan | KZ | ru |
| Germany | DE | de |
| Malaysia | MY | ms |
| Albania | AL | sq |
| Austria | AT | de |
| Vietnam | VN | vi |
| Italy | IT | it |

### Google Translate API

- Use `@google-cloud/translate` v2 (simple, no project setup beyond API key)
- Environment variable: `GOOGLE_TRANSLATE_API_KEY`
- In-memory cache (Map keyed by text+target) — same term + target won't change
- ~100 canonical products x 12 countries = ~1,200 translations = ~18,000 characters = effectively free

## Error Handling & Edge Cases

### Translation failures
- If Google Translate API fails or key is missing, fall back to English term
- Show subtle warning in banner: "Translation unavailable, searching in English"
- Failed translations are not cached (retry on next attempt)

### No unit info in canonical name
- Skip unit/quantity filters, only auto-fill translated search term
- Banner shows without unit info

### No results after filtering
- If unit+name filter returns 0 results, automatically relax: retry with just translated name (no unit filter)
- Show note: "No exact unit match found, showing all results for 'Duong trang'"

### Countries without language_code
- "Find matches" still works but skips translation — uses English term directly
