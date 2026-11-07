#!/usr/bin/env bash
# Vercel install step (vercel.json "installCommand").
#
# - Bun installs from bun.lock; Vercel's build image ships it. Unlike npm under
#   NODE_ENV=production it keeps devDependencies, which the build needs
#   (esbuild) and which @vercel/node's own install would otherwise re-add.
# - node_modules comes back from Vercel's build cache, so a frozen install is
#   usually a no-op check.
# - The two installs are independent, so they run side by side.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "bun $(bun --version)"

bun install --frozen-lockfile &
root=$!
(cd frontend && bun install --frozen-lockfile) &
frontend=$!

wait "$root"
wait "$frontend"
