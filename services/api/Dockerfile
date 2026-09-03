# Self-contained NestJS API image (ADR-009). Build context = services/api
# (Railway: `railway up services/api --path-as-root`). The service imports no
# workspace packages at runtime, so a services/api-scoped context + its own
# committed package-lock.json give a reproducible `npm ci` without the monorepo.

# ---- build: install ALL deps (incl. dev/types) and compile TS -> dist/ -------
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: runtime dependencies only (no dev/types) ---------------------
FROM node:26-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- runtime: compiled output + prod deps, non-root, production --------------
FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# node:20-alpine ships an unprivileged `node` user — run as it, never root.
USER node
EXPOSE 8090
CMD ["node", "dist/main.js"]
