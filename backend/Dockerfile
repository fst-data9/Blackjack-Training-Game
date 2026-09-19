FROM docker.io/library/node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm ci || npm i

# Copy source
COPY . .

EXPOSE 3001
CMD ["node", "server.js"]
