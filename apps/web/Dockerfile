# Multi-stage build for the PriceGuard admin dashboard (Next.js, standalone output — see
# next.config.ts). Node version pinned to the exact patch this project was built against,
# matching apps/api/Dockerfile's rationale.
FROM node:22.22.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22.22.2-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The API base URL is baked into the client bundle at build time (NEXT_PUBLIC_ prefix is
# a build-time-only convention in Next.js) — see docker-compose.yml, which passes it as a
# build arg per environment rather than hard-coding it here.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN npm run build

FROM node:22.22.2-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S priceguard && adduser -S priceguard -G priceguard
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER priceguard
EXPOSE 3000
CMD ["node", "server.js"]
