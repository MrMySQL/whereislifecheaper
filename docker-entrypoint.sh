#!/bin/bash
set -e

# Start Xvfb (X Virtual Frame Buffer) for headed browser support
echo "Starting Xvfb on display :99..."
Xvfb :99 -screen 0 1920x1080x24 &

# Wait for Xvfb to be ready
sleep 2

# Optionally sync exchange rates before scraping
if [ "$SYNC_RATES" = "true" ]; then
    echo "Syncing exchange rates..."
    npm run rates:sync
fi

# Optionally seed database before scraping
if [ "$SEED_DB" = "true" ]; then
    echo "Seeding database..."
    npm run seed
fi

# Execute the main command
echo "Executing: $@"
exec "$@"
