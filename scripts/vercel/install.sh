#!/usr/bin/env bash
# Vercel install step (vercel.json "installCommand").
#
# - The two installs are independent, so they run side by side.
# - Root keeps its devDependencies even when NODE_ENV=production: the build
#   needs esbuild and ts-node, and @vercel/node re-runs `npm install` for the
#   function *with* devDependencies afterwards - omitting them here made every
#   build delete ~260 packages only to reinstall them a minute later.
# - node_modules comes back from Vercel's build cache, so `npm install` (not
#   `npm ci`, which wipes it) is the fast path; audit/fund only print noise.
set -euo pipefail
cd "$(dirname "$0")/../.."

flags=(--no-audit --no-fund --prefer-offline)

npm install --include=dev "${flags[@]}" &
root=$!
(cd frontend && npm install "${flags[@]}") &
frontend=$!

wait "$root"
wait "$frontend"
