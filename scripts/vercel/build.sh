#!/usr/bin/env bash
# Vercel build step (vercel.json "buildCommand"). Produces only what Vercel
# serves, as fast as possible:
#
#   dist/frontend/       static SPA (vite)
#   dist/vercel-api/     the API bundle that api/index.js re-exports (esbuild)
#
# plus applying migrations to DATABASE_URL.
#
# No type-checking here: .github/workflows/ci.yml type-checks backend and
# frontend on every push and PR. Here it cost ~25s per deploy - our own `tsc`,
# the frontend's `tsc -b`, type-checking ts-node, and @vercel/node type-checking
# api/index.ts on its own, which shipping plain JS from api/ avoids.
#
# The migration is network-bound and the two bundles are CPU-bound, so they
# overlap.
set -euo pipefail
cd "$(dirname "$0")/../.."

pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT

node_modules/.bin/ts-node --transpile-only scripts/migrate.ts &
pids+=($!)

(cd frontend && node_modules/.bin/vite build) &
pids+=($!)

node_modules/.bin/esbuild src/api/vercel.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --packages=external --outfile=dist/vercel-api/index.js --log-level=warning

for pid in "${pids[@]}"; do
  wait "$pid"
done
trap - EXIT
