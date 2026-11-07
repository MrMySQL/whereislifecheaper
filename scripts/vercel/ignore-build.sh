#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json "ignoreCommand"): exit 0 skips the
# deployment, anything else builds it.
#
# Skips only when every changed file is one the deployment cannot depend on.
# Anything unexpected - no base commit, a shallow clone missing it, a git
# error - falls through to building.
cd "$(dirname "$0")/../.." || exit 1

# Compare against the last successful deployment of this branch. Without one
# (a branch's first push) or when the shallow clone lacks it, build: diffing
# just HEAD^..HEAD would judge a multi-commit push by its last commit alone.
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "No previous deployment commit to compare against; building."
  exit 1
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
