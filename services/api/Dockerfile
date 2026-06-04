# ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
#    Reason: PowerSync write path until backend architecture is decided.
#    Tracking: docs/DECISIONS.md ADR-008.

FROM node:20-alpine

WORKDIR /app

# Copy only the API workspace's manifest first for layer caching.
# This is the throwaway-quick path — production-grade builds would use
# the monorepo lockfile + npm ci. For local-dev, npm install works.
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY src ./src
COPY tsconfig.json ./

ENV NODE_ENV=development
EXPOSE 8090

CMD ["npm", "start"]
