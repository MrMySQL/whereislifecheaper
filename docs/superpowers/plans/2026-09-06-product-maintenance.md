# Product maintenance implementation plan

**Goal:** Automatically exclude stale/unavailable offers and discover reviewable replacements while interpreting package contents independently of shop selling units.
**Approved design:** Conversation of September 5–6: preserve listing history; distinguish missing observations from explicit out-of-stock; interpret contents and price basis with evidence; abstain on conflicts; classify independently of comparability; optional AI assistance; review ambiguous mappings and support undo.
**Architecture:** Offer-level observations and quantity JSON, price-level interpretation snapshots, shared conservative quantity interpreter, maintenance coverage/recommendation service, authenticated review API and admin page. Existing scraper workflows run maintenance. Public comparisons use seven-day freshness by default. No production mutation or deployment during implementation.

## Shared contracts
- `src/utils/productQuantity.ts`: `interpretProductQuantity(input)` accepts name, description?, unit?, unitQuantity?, price and optional priceBasis ('package'|'kg'|'l'|'piece'|'unknown'). Returns `{version:1,status:'verified'|'unknown'|'conflict',contentQuantity:number|null,contentUnit:'kg'|'l'|'pieces'|null,priceBasis:'package'|'kg'|'l'|'piece'|'unknown',comparablePrice:number|null,evidence:string[]}`. Never invent weight or turn per-kg prices into package prices.
- Migration 016 (root): product_mappings gains `availability_status` ('available'|'out_of_stock'|'unknown', default unknown), `last_checked_at`, `last_available_at`, `quantity_info` JSONB, `raw_observation` JSONB, `duplicate_of_mapping_id` nullable FK. prices gains `quantity_info` JSONB. Original product unit fields preserved. Historical price JSON never inferred from a later observation.
- Migration 017 (maintenance implementer): owns policy, suggestion, review audit and run tables. All migrations repeatable because existing runner reruns every SQL file.
- Maintenance API `/api/maintenance`: GET `/overview`, GET `/suggestions?status=pending&country_id=…`, POST `/run`, POST `/suggestions/:id/approve`, `/reject`, `/undo`. Backend implementer owns route plus shared `src/types/maintenance.types.ts`; UI implementer uses this contract.
- Maintenance default is propose/review, no autonomous semantic mappings. Optional AI only ranks bounded database candidates, cannot invent IDs or override deterministic quantity/availability checks. No dependency on configured AI for deterministic operation.

## Tasks
- [x] 1. Quantity interpretation: failing real behavior tests for 5 L water stored as one piece, 5 kg bag, loose per-kg apples, multipacks, missing weights, conflicting sources, invalid prices; implement interpreter; run targeted tests.
- [x] 2. Ingestion and eligibility: migration 016; persist observations and interpretation in batch and single paths; do not write available prices for out-of-stock; Migros retains explicit unavailable observations; update comparison to default fresh eligible prices and safe normalized averages; collect new observations without guessing legacy availability; integration tests.
- [x] 3. Maintenance engine: multilingual candidate retrieval from existing mappings and policies, quantity-aware coverage, freshness/availability gates, optional AI ranking, idempotent suggestions, transactional approve/reject/undo with revalidation, authenticated API, bounded scheduled CLI and tests. Preserve unavailable/missing distinction, do not infer discontinued from absent full/partial scrapes.
- [x] 4. Admin review: coverage and run status, refresh button, candidate evidence and quantity, approve/reject/undo, clear loading/error/empty states; link from admin navigation; frontend build.
- [x] 5. Integration: both server entries, workflow and scripts, docs/configuration, baseline and new tests, build, local database migration/query verification where available, independent final review and fixes.

## Decisions
- PR branch `codex/product-maintenance-pr` is isolated from current `main`; concurrent scraper reliability changes remain in their original checkout.
- No automatic retirement on absent scrapes: catalog/category completeness is not reliable enough today. Freshness gates remove stale prices without asserting discontinuation.
- Do not delete products or prices; mapping review changes classification with audit and conflict-safe undo.
- User has approved implementation; execute without another design approval checkpoint.

## Verification and rollout status
- All 229 tests across 29 suites on the isolated PR branch and backend/frontend build passed locally, including disposable PostgreSQL migrations and review transactions.
- Independent final review findings addressed with regression coverage.
- Visual browser QA remains outstanding: no working browser runtime was available.
- Production remains unchanged. Follow `docs/product-maintenance.md` to collect new observations before deploying the stricter comparison endpoint.
