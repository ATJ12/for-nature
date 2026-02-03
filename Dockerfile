# ────────────────────────────────────────────────────────────────────────────
# Stage 1 — install dependencies (cached layer)
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# ────────────────────────────────────────────────────────────────────────────
# Stage 2 — production image (minimal)
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS prod

# non-root user for security
RUN addgroup -g 1001 -S ecosort && adduser -u 1001 -S ecosort -G ecosort

WORKDIR /app

# copy only what we need
COPY --from=deps /app/node_modules ./node_modules
#COPY server/                       ./server/
COPY . .
# run as non-root
USER ecosort

# expose the port (default 3000; override via PORT env)
EXPOSE 3000

# health-check — Docker / cloud orchestrators use this
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# entrypoint
CMD ["node", "server.js"]
