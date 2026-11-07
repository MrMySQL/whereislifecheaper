#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json "ignoreCommand"): exit 0 skips the
# deployment, anything else builds it.
#
# Skips only when every changed file is one the deployment cannot depend on.
# Anything unexpected - no base commit, a shallow clone missing it, a git
# error - falls through to building.
cd "$(dirname "$0")/../.." || exit 1

# The last successful deployment of this branch, when Vercel knows it and the
# clone has it; otherwise just the newest commit.
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  base="HEAD^"
fi

if git diff --quiet "$base" HEAD -- . \
  ':(exclude)docs' \
  ':(exclude).github' \
  ':(exclude)terraform' \
  ':(exclude).claude' \
  ':(exclude).agents' \
  ':(exclude)*.md' \
  ':(exclude)Dockerfile' \
  ':(exclude).dockerignore' \
  ':(exclude)docker-compose.yml' \
  ':(exclude)docker-entrypoint.sh' \
  ':(exclude).env.example' \
  ':(exclude)**/__tests__/**' \
  ':(exclude)frontend/tests' \
  ':(exclude)jest.config.js' \
  ':(exclude)frontend/jest.config.cjs' \
  ':(exclude)frontend/eslint.config.js'
then
  echo "Only docs/CI/infra/test files changed since ${base}; skipping deployment."
  exit 0
fi
exit 1
