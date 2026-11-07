FROM node:20-bookworm-slim

# Install Chromium dependencies and xvfb for headed browser support
RUN apt-get update && apt-get install -y \
    xvfb \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bun installs dependencies from bun.lock; Node still runs everything.
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun

# Copy package files first for better layer caching. --production still
# installs typescript, ts-node and the @types the scripts need: they are
# regular dependencies.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy application source
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Create directories for logs and screenshots
RUN mkdir -p logs screenshots

# Set environment variables
ENV NODE_ENV=production
ENV DISPLAY=:99

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "scraper:run"]
