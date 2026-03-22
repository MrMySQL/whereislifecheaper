# Mapping Automation Design

## Problem

Mapping canonical products to supermarket products in a new country is slow. The admin must manually translate canonical product names, search through hundreds of unfiltered results, and visually identify the right product. For example, searching "sugar" in Vietnam returns 115 results across 3 pages with no way to filter by weight.

## Solution

Two enhancements to the existing admin mapping page:

### 1. Unit/Weight Filters

Two new filter controls next to the existing search bar:

- **Unit type dropdown** — options: All (default), kg, g, L, ml, piece. Values sourced from distinct `products.unit` values for the selected country.
- **Quantity input** — numeric field that filters on `products.unit_quantity`. Exact match. Only enabled when a unit type is selected.

**Backend:** Add `unit` and `unit_quantity` query params to `GET /canonical/products-by-country/:id`. Filter with `WHERE unit = $x AND unit_quantity = $y`.

### 2. Bilingual Search

When the admin types an English search term (e.g., "sugar"):

1. Frontend detects the term is English (ASCII-only heuristic)
2. Frontend calls `GET /api/translate?text=sugar&target=vi` → returns "đường"
3. Frontend searches with both terms: `search=sugar,đường`
4. Backend splits on comma and uses OR in the WHERE clause: `WHERE (name ILIKE '%sugar%' OR name ILIKE '%đường%')`

**Translation API:** Google Cloud Translation API. Free tier covers 500k chars/month. Results cached in-memory on the backend so repeated searches don't re-call the API.

**New endpoint:** `GET /api/translate?text=<term>&target=<language_code>` — returns `{ translated: "..." }`. The frontend calls this, then passes both terms to the existing product search.

### Updated Workflow

1. Select country (Vietnam)
2. Filter by unit type (kg) and quantity (1)
3. Type "sugar" in search box
4. Frontend auto-translates → "đường"
5. Search with both terms + unit filters applied
6. ~3-5 results instead of 115
7. Pick the right one, link to canonical product

### What Stays the Same

- Canonical product dropdown, linking/unlinking
- Supermarket filter, pagination, mapped-only toggle
- All existing API endpoints (only extended, not replaced)

### New Pieces

- 2 filter controls in frontend (unit dropdown, quantity input)
- 1 new API endpoint (`/api/translate`)
- Updated query in `products-by-country` for unit/quantity params
- Google Cloud Translation API integration with in-memory cache

### Language Code Mapping

Each country needs a translation target language code. This can be derived from the country record (country code → language code mapping, e.g., VN → vi, TR → tr, DE → de). A simple lookup table in the backend config.
