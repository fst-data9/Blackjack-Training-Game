FROM docker.io/library/node:24-alpine

WORKDIR /app

# Install deps first (better caching)
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci

# Copy the API and the static website it serves
COPY backend ./backend
COPY index.html blackjack-game.js auth.js site-nav.js learning-pages.js learning-pages.css strategy-charts.js ./
COPY images ./images
COPY database ./database
COPY scripts/verify-security.mjs ./scripts/verify-security.mjs

WORKDIR /app/backend

EXPOSE 3001
USER node
CMD ["node", "server.js"]
