# Country Mapping Implementation Plan

**Goal:** Extend the existing review queue to onboard countries with no prior mappings, using multilingual discovery, resumable country scans, and selected batch approval.
**Architecture:** Reuse maintenance validation and audited review. Add shared translation plus optional AI vocabulary expansion, persisted per country/canonical. Country runs use keyset cursors and bounded requests. Dry runs perform no database writes and return preview evidence. Every semantic mapping remains an explicit review decision.
**Tech Stack:** TypeScript, Express, PostgreSQL, React, existing Google Translation and optional AI adapter.
**Spec:** User-approved recommendation in this task: multilingual discovery, country-specific runs, batch approval, test with an unmapped production country, isolated worktree.

## Constraints
- Work only in this worktree. The original snapshot is preserved on codex/country-mapping-tested; the PR is rebased onto current main.
- Production verification is read-only; clone public product data locally when new schema is absent. Never run fixture truncation against production.
- Reuse freshness, availability, quantity validation and undo. No automatic semantic approvals.
- One request scans at most 25 canonical/store combinations. A continuation cursor only works with a selected country.
- Failed batch items report their error independently; successful items retain audit/undo.

## Tasks
- [x] Backend: add failing service/API/integration tests for country isolation, continuation, translation without local examples, no-write previews, invalid batch requests, and partial batch conflicts. Implement shared multilingual vocabulary service and country alias persistence, route/CLI country and cursor options, returned previews and batch results. Existing defaults stay compatible.
- [x] Frontend: country selector beside Map this country; resumable batches with scanned/proposed totals; compact grouped suggestions with selected batch approval/rejection, source image, local and translated names, quantities, explanations. Show partial failures and clear selection on scope/page changes.
- [x] Verification: run backend tests, disposable PostgreSQL integration tests, frontend/backend builds, browser exercise with fixtures, production coverage audit and local replay of an unmapped country. Measure candidate results and record limitations.
- [x] Independent review: review new changes relative to baseline, fix important findings, rerun affected tests and commit implementation.

## Frontend API contract
POST /maintenance/run accepts {limit:1..25,dry_run:false,country_id?:string,cursor?:string}. Response extends existing run with {next_cursor:string|null,has_more:boolean,warnings:string[],previews:Array<{canonical_product_id,canonical_name,country_id,supermarket_id,product_id,mapping_id,product_name,payload}>}. Pass returned cursor to resume; do not auto-approve.
POST /maintenance/suggestions/batch accepts {ids:string[],action:'approve'|'reject',reason?:string}, maximum 50 unique positive decimal IDs. Returns {results:Array<{id:string,status?:string,error?:string}>}; status is set on success and error on failure. Reuse existing review transactions.
Suggestion payload adds optional image_url, translated_name, search_terms. Country run completion counts are per batch; frontend accumulates counts and stores continuation per country in sessionStorage. Resume after request failure with last successful cursor (idempotent proposals).

## Completion evidence

After rebasing onto current main, 355 backend/database tests and nine frontend tests passed. Backend/frontend builds and mocked browser workflows passed. Independent review findings (hidden selection, pending-request scope changes, full-cream milk, and compact produce quantities) were reproduced and resolved. Italy read-only export was explicitly approved; local replay checked 22 canonicals and returned 52 candidates across 14 canonicals in 10.264 seconds with zero database writes. Production was not deployed or modified. See docs/country-mapping.md.
