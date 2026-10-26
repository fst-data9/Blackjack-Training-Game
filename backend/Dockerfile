FROM docker.io/library/node:24-alpine

WORKDIR /app

# Install deps first (better caching)
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci

# npm is only needed to install dependencies at build time. Removing its global
# bundle also removes vulnerable packages that are unrelated to the API.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Copy the API and the static website it serves
COPY backend ./backend
COPY counting.js counting.css strategy-catalog.cjs chart-exports.js simulation.js simulation.css index.html blackjack-game.js auth.js site-nav.js learning-pages.js learning-pages.css learning-content.cjs consent.js adsense.js ads.txt strategy-charts.js robots.txt sitemap.xml ./
COPY images ./images
COPY database ./database
COPY scripts/verify-security.mjs ./scripts/verify-security.mjs

WORKDIR /app/backend

EXPOSE 3001
USER node
CMD ["node", "server.js"]
