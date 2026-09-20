FROM docker.io/library/node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci

# Copy the API and the static website it serves
COPY backend ./backend
COPY index.html blackjack-game.js auth.js ./
COPY images ./images

WORKDIR /app/backend

EXPOSE 3001
USER node
CMD ["node", "server.js"]
