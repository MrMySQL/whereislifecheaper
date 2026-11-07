#!/usr/bin/env bash
# Vercel install step (vercel.json "installCommand").
#
# - Bun installs from bun.lock; Vercel's build image ships it. Unlike npm under
#   NODE_ENV=production it keeps devDependencies, which the build needs
#   (esbuild) and which @vercel/node's own install would otherwise re-add.
# - node_modules comes back from Vercel's build cache, so a frozen install is
#   usually a no-op check.
# - The two installs are independent, so they run side by side; if one fails,
#   the other is stopped rather than left running.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "bun $(bun --version)"

pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT

bun install --frozen-lockfile &
pids+=($!)
# `exec`, so the trap's kill reaches bun itself and not just the subshell.
(cd frontend && exec bun install --frozen-lockfile) &
pids+=($!)

for pid in "${pids[@]}"; do
  wait "$pid"
done
trap - EXIT
