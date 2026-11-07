#!/usr/bin/env bash
# Vercel build step (vercel.json "buildCommand"). Produces only what Vercel
# serves, as fast as possible:
#
#   dist/frontend/       static SPA (vite)
#   dist/vercel-api/     the API bundle that api/index.js re-exports (esbuild)
#
# then applies migrations to DATABASE_URL - only once both have built, so a
# failed build never leaves the database migrated ahead of a deployment that
# does not happen. They run from an esbuild bundle of scripts/migrate.ts with
# plain node: loading ts-node and the TypeScript compiler took ~4s on Vercel's
# builder. The bundle sits directly in dist/ so its __dirname-relative path to
# src/database/migrations still resolves.
#
# No type-checking here: .github/workflows/ci.yml type-checks backend and
# frontend on every PR and on pushes to main. Before this script, our own
# `tsc`, the frontend's `tsc -b` and `ts-node scripts/migrate.ts` (which
# type-checks) cost ~15s per deploy.
set -euo pipefail
cd "$(dirname "$0")/../.."

pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT

bundle() {
  node_modules/.bin/esbuild "$1" --outfile="$2" \
    --bundle --platform=node --format=cjs --target=node20 \
    --packages=external --log-level=warning
}

# vite is the long CPU-bound step; the esbuild bundles fit alongside it.
(cd frontend && node_modules/.bin/vite build) &
pids+=($!)

bundle src/api/vercel.ts dist/vercel-api/index.js
bundle scripts/migrate.ts dist/migrate.js

for pid in "${pids[@]}"; do
  wait "$pid"
done
trap - EXIT

node dist/migrate.js
