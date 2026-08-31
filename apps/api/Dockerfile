# Multi-stage build for the PriceGuard API (NestJS). Node version pinned to the exact patch
# this project was developed and tested against (see package.json "engines" and
# docs/adr/0002-technology-stack.md) rather than a floating `node:22-alpine` tag, so a
# rebuild six months from now can't silently pick up a different Node minor/patch.
FROM node:22.22.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22.22.2-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Prune devDependencies out of node_modules for the runtime image, rather than a second
# `npm ci --omit=dev` (which would re-resolve against the network at build time).
RUN npm prune --omit=dev

FROM node:22.22.2-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S priceguard && adduser -S priceguard -G priceguard
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
USER priceguard
EXPOSE 4000
# Migrations are run as an explicit, separate step (see infra/docker/docker-compose.yml's
# `api-migrate` service) — never automatically on container boot. An API replica racing
# another replica's in-flight migration on every restart is a real failure mode; a single
# one-shot migration job run before the API (re)starts is not.
CMD ["node", "dist/src/main.js"]
