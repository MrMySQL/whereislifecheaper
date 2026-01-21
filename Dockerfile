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

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Install dev dependencies temporarily to compile TypeScript
RUN npm install typescript ts-node @types/node @types/pg @types/express @types/cors @types/passport @types/passport-google-oauth20 @types/express-session @types/connect-pg-simple

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
