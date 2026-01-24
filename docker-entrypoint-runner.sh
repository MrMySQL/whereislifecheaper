#!/bin/bash
set -e

# Start Xvfb (X Virtual Frame Buffer) for headed browser support
echo "Starting Xvfb on display :99..."
Xvfb :99 -screen 0 1920x1080x24 &

# Wait for Xvfb to be ready
sleep 2

# Clone the repository
echo "Cloning repository..."
if [ -z "$GITHUB_TOKEN" ]; then
    echo "ERROR: GITHUB_TOKEN environment variable is required"
    exit 1
fi

REPO_URL="https://${GITHUB_TOKEN}@github.com/MrMySQL/whereislifecheaper.git"
GITHUB_REF="${GITHUB_REF:-main}"

git clone --depth 1 --branch "$GITHUB_REF" "$REPO_URL" /app/repo
cd /app/repo

echo "Checked out: $(git rev-parse --short HEAD) on branch/ref: $GITHUB_REF"

# Install dependencies
echo "Installing npm dependencies..."
npm ci

# Install Playwright Chromium browser
echo "Installing Playwright Chromium..."
npx playwright install chromium

# Create directories for logs and screenshots
mkdir -p logs screenshots

# Run database migrations (always - they're idempotent)
echo "Running database migrations..."
npm run migrate

# Optionally seed database after migrations
if [ "$SEED_DB" = "true" ]; then
    echo "Seeding database..."
    npm run seed
fi

# Optionally sync exchange rates before scraping
if [ "$SYNC_RATES" = "true" ]; then
    echo "Syncing exchange rates..."
    npm run rates:sync
fi

# Execute the main command
echo "Executing: $@"
exec "$@"
