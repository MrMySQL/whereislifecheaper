# Product maintenance

The admin page at `/admin/maintenance` shows coverage gaps, recent maintenance runs and replacement suggestions. Approve or reject candidates individually; approved mappings can be undone while the product has not subsequently changed. Existing mappings and historical prices are never deleted by maintenance.

## Behavior

- A listing sighting records its availability, last checked time, last available time, raw shop unit and derived package interpretation. A product missing from a scrape is not marked discontinued or out of stock.
- Out-of-stock observations never create a usable price. A later available observation restores eligibility automatically. Migros now retains explicitly reported `OUT_OF_STOCK` API items; an item omitted by the retailer API remains unknown once its old observation expires.
- A 5 L bottle sold as one piece is interpreted as 5 L of contents. A 5 kg bag may be compared per kg. An explicit per-kg quote is not divided by the bag weight. Unknown quantities and conflicting source fields abstain.
- Each new price stores its own quantity interpretation. The public canonical comparison has no age cutoff by default, so older prices remain visible with freshness information. Callers can opt into a cutoff with `max_age_days`. It includes only active stores with available observations matching their latest price snapshot. Per-kg/liter comparisons additionally require verified dimensional quantities. Configured canonical unit and fixed-package quantity policies apply to both coverage and comparison. At least two countries need eligible offers for a comparison row.
- Historical prices without interpretation are not silently reinterpreted. Shop unit fields stay unchanged; normalized content units are used in per-unit comparison responses.
- Canonical product classification is global to the product. Availability is specific to the retailer listing. New retailer IDs/pages retain separate listing records; similar names alone never cause an automatic merge. The optional `duplicate_of_mapping_id` field excludes a confirmed duplicate from coverage/comparison, but this release does not automatically identify or merge duplicate listings.

## Replacement suggestions

Maintenance scans enabled canonical products across active stores. It prioritizes uncovered combinations, rotates checks to avoid starvation, and searches recent unclassified offers using canonical names, local previously mapped names and optional aliases. Quantity rules and exclusions apply before a suggestion can be approved.

All new semantic mappings require review in this release. Freshness/availability filtering is automatic. This is the initial review phase of the hybrid design: automatic mapping based on learned approval patterns is not enabled. AI assistance ranks candidates; it cannot add product IDs, override availability/quantity validation or directly modify classifications. Unsupported quantity interpretations remain for manual investigation.

Approvals re-read the listing and latest price inside a transaction. Changed, stale, unavailable or already classified products are rejected. Each decision records the actor and before/after classification. Undo refuses to overwrite subsequent product edits. Rejections and undone suggestions are remembered rather than repeatedly proposed. Pending suggestions can refresh when their evidence changes.

## Country onboarding

See [country-mapping.md](country-mapping.md) for multilingual discovery, resumable country scans, selected batch review, and the production-data replay results. Migration 018 is required for the vocabulary cache.

## Commands and scheduling

```sh
npm run products:maintain -- --dry-run --limit=25
npm run products:maintain -- --apply --limit=25
```

The default is dry-run. `--apply` creates review proposals; it does not approve mappings. Dry runs are read-only: they do not record run history, save vocabulary, persist proposals, or advance the live scanning cursor. They return preview evidence in the response. Each run is bounded to 1–25 product/store combinations; repeated runs rotate through gaps. The UI can trigger the same bounded discovery operation.

`.github/workflows/product-maintenance.yml` runs after Daily Scrape completes and daily at 08:23 UTC, with concurrency protection. It uses the existing `DATABASE_URL` secret. No login session or admin browser automation is required by the scheduled worker. Failed runs appear in GitHub Actions and the admin run history; successful proposals appear in the review queue.

Optional AI ranking requires both:

- `OPENAI_API_KEY`: server secret / GitHub Actions secret.
- `MAPPING_AI_MODEL`: a model supporting Responses structured outputs, explicitly selected by the operator. For GitHub Actions, set it as a repository variable.

Without both, no provider request occurs. The adapter sends only bounded canonical/candidate names and IDs, uses structured output, sets `store:false`, and falls back to deterministic ranking on timeout or provider failure. It does not send database credentials, user records or price histories. Candidate names are treated as untrusted text.

Optional canonical policies live in `product_maintenance_policies`: `aliases`, `excluded_terms`, `expected_unit`, `expected_quantity`. These are operator-configured vocabulary and comparison rules. For per-unit canonicals, package quantity can differ; for fixed-package canonicals, expected quantity must match. The admin review UI currently does not edit these policies.

## Staged production rollout

This implementation has not modified or deployed production. Do not deploy the new comparison endpoint before new observations have been collected: migration 016 deliberately leaves legacy availability as unknown.

1. Back up the database using the existing operational procedure. Apply the additive migrations 016 and 017 with `npm run migrate` from this revision. All migrations are repeatable; this does not assert availability for old rows.
2. Run the **new scraper code** against production before deploying the new API/frontend. For example, execute the Daily Scrape workflow from a branch containing these changes using workflow dispatch. This writes current availability and price interpretation snapshots while the previous API can continue serving.
3. Run `npm run products:maintain -- --dry-run --limit=25` from this revision and inspect its coverage using the local admin API connected to the intended database. Verify important enabled canonical products have fresh, available, interpreted prices in at least two countries. Investigate unexpectedly missing quantities or scrape failures before switching the API.
4. Deploy the API/frontend from this revision only after those readiness checks. Smoke-test `/api/canonical/comparison` and authenticated `/admin/maintenance`, then enable the maintenance workflow on the default branch.
5. Generate proposals with `--apply`, review samples across countries, and optionally configure AI ranking. Do not enable autonomous semantic mapping based solely on model confidence.

Schema additions are backward compatible with the previous app. Reverting application code does not require deleting observation columns, prices or audit history.

## Verification

Unit/API tests run with `npm test -- --runInBand`. PostgreSQL integration tests are opt-in and **truncate fixture tables**, so only use a disposable database:

```sh
TEST_DATABASE_URL=postgres://postgres:local-test-only@127.0.0.1:55439/maintenance_test \
  npm test -- --runInBand productMaintenance.integration maintenanceReview.integration
npm run build
```

Coverage includes stock transitions, package normalization, historical snapshots, latest-price eligibility, canonical policy compatibility, repeatable migrations, review revalidation, idempotency and conflict-safe undo. Backend and frontend builds were verified locally. Browser QA passed using the production frontend build with synthetic local API responses: country/status filters, covered rows, bounded scan requests, approve/reject/undo, conflict messages, failed-load retry recovery, and desktop/mobile layouts (1440 px and 390 px). Database integration tests separately verify real persistence and eligibility; this is not a production smoke test.
