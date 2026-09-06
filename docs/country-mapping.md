# Country product mapping

The maintenance page at `/admin/maintenance` can now scan a selected country without any previously mapped local products. Choose **Country to map**, then **Map this country**. Each request checks up to 25 canonical/store combinations. **Resume mapping** continues from the last successful cursor; progress survives a reload in the same browser session. **Start over** resets the cursor. Discovery saves review proposals; it never approves classifications. Leave **All countries** selected and use **Run maintenance** for the existing bounded all-country scan; this mode does not use a country continuation cursor.

Suggestions are grouped by canonical product and show the original name, optional English translation, image, package interpretation, price, and source link. Select up to 50 visible proposals and approve or reject them together. Every item uses the existing transaction, latest-offer validation, audit, and undo. A stale or conflicting item returns its own error while other valid items can succeed. Filter/page changes clear selection, and navigation is locked during review requests.

## Discovery and configuration

- Migration `018_country_mapping_vocabulary.sql` adds a cache keyed by country and canonical product. A changed canonical name invalidates its saved vocabulary. Migration `019_mapping_vocabulary_cascade.sql` upgrades existing cache foreign keys so deleting either parent also deletes generated vocabulary.
- `GOOGLE_TRANSLATE_API_KEY` enables translated canonical names, plural produce names, and batched English product-name translations. The scheduled workflow now passes this secret to the worker.
- If both `OPENAI_API_KEY` and `MAPPING_AI_MODEL` are configured, semantic local synonyms and candidate ranking are enabled. The model is explicitly operator-selected. Calls use bounded structured output and `store:false`; provider failures fall back to translation/keyword discovery with review warnings where relevant. No model can invent a product ID or approve a mapping.
- Approved local product names are reused from existing country mappings. Previously rejected/undone listing proposals are excluded from repeat discovery. Existing canonical `aliases`, `excluded_terms`, `expected_unit`, and `expected_quantity` policies remain available in `product_maintenance_policies`.
- Whole-word matching replaces substring matching; stop words and package units are excluded. Up to 200 candidates are retrieved, quantity checks run first, then up to 100 eligible names are translated in one batch. At most five proposals per canonical/store are returned.
- Translated product-type checks reject common incompatible forms. Plain produce uses conservative vocabulary and abstains on unknown descriptions. These checks can miss legitimate brands/varieties; suggestions still require human judgment. They are not a measured confidence score or an autonomous classifier. Missing translation/model configuration is surfaced as a warning, with remaining keyword candidates needing closer review.
- Freshness, availability, duplicate, snapshot, and quantity checks remain authoritative. Unsupported quantities and unavailable/stale listings are not proposed. Per-unit canonical products can have different package sizes; fixed-package products require the expected quantity.

## CLI

```sh
# Entire country preview: no database writes, including run history.
npm run products:maintain -- --country=701 --dry-run --all

# Save proposals for one country, still requiring admin approval.
npm run products:maintain -- --country=701 --apply --all

# Bounded batch, then resume with the returned next_cursor.
npm run products:maintain -- --country=701 --apply --limit=5
npm run products:maintain -- --country=701 --apply --limit=5 --cursor=12:1534
```

Without `--all`, a request processes one bounded batch. Only pass a cursor returned for that country. The UI saves it per country; repeated requests safely upsert proposals. A failed request retains the previous successful cursor for retry. A preview returns `previews`, `warnings`, `has_more`, and `next_cursor`. Zero suggestions means no eligible candidates were found within the search bounds, not proof that a store does not sell the product.

## Verification on production data

On September 6, 2026, a read-only audit of the Railway production database found Italy and Romania had zero mapped products. Italy had 14,053 listings; Romania had 17,894. Italy had 10,359 fresh available unmapped offers at the exported snapshot; Romania had legacy unknown availability and no checked timestamps.

With explicit authorization, Italy's public catalog, latest prices, and observation evidence were exported in a repeatable-read read-only transaction at `2026-09-06T04:25:15.989Z`. The gitignored fixture is `tmp/production-mapping-fixture.json`, SHA-256 `330dee19cea86cddf9785b191a3d05945b28caf1e23507f6f9960cb0e1dcf66f`. No user or authentication records were exported. The local replay uses a separate disposable database and does not modify production.

The first replay exposed substring false positives such as chocolate for cola and fruit snacks for produce. Regression tests now cover these cases, dietary distinctions, full-cream milk, plural names, and prepared-food exclusions. The final replay checked all 22 enabled canonical products in 10.264 seconds and returned 52 review suggestions covering 14 canonicals, with zero run-history, proposal, or vocabulary writes. Eight canonicals had no shortlisted candidate under the current freshness, quantity, vocabulary, and product-type checks. Counts and evidence are recorded in `tmp/italy-mapping-results.json`; these are candidate discovery results, not approved coverage or an accuracy benchmark. Some basket definitions still require a human choice (for example oil type, rice variety, or sparkling water).

Initial verification passed 355 backend tests across 35 suites after rebasing onto current main (including disposable PostgreSQL integration tests), nine frontend state/API tests, both production builds, targeted frontend lint, and a mocked browser exercise of country resume/reload, grouped bilingual cards, partial approval failures, and selection safety. Full frontend lint has unrelated pre-existing errors outside this change.

Cubic review fixes and integration with main passed 427 backend tests across 39 suites, 13 frontend tests (including the rendered all-country control and request), and both production builds. Regression coverage includes partial translation failure, candidates beyond the AI input cap, numeric API IDs, descriptive/piece produce, and repeated upgrade migrations followed by parent deletion.

## Rollout

The catalog audit and replay did not modify production mappings. Migration 018 was absent at the initial audit and present at the subsequent pre-merge read-only check. Vercel runs `npm run migrate` during deployment builds, so schema changes may already be applied by a preview deployment. Ensure migrations 018 and 019 have run before running the new API/worker, and configure the translation secret for scheduled discovery. Use a read-only country preview first, then generate proposals and review them. Romania needs new scraper observations before it can produce eligible suggestions; a missing observation is not assumed available.

The PR is based on current main, which already includes the maintenance foundation and its review fixes. The original tested snapshot is preserved locally on `codex/country-mapping-tested`.

## Reproducible checks

Use a disposable local database only; integration fixtures truncate tables:

```sh
TEST_DATABASE_URL=postgres://postgres:local-test-only@127.0.0.1:55439/maintenance_test \
DATABASE_URL=postgres://postgres:local-test-only@127.0.0.1:55439/maintenance_test \
  npm test -- --runInBand
npm run test:frontend
npm run build
```
