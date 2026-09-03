# Self-contained NestJS API image (ADR-009).

FROM node:20-alpine

WORKDIR /app

# Copy only the API workspace's manifest first for layer caching. Railway and
# local Compose both build with services/api as the isolated Docker context.
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY src ./src
COPY tsconfig.json ./

ENV NODE_ENV=development
EXPOSE 8090

CMD ["npm", "start"]
