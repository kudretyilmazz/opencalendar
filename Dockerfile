# syntax=docker/dockerfile:1
# One image, three entrypoints (ADM-001): web (default), worker (`node worker.js`), cli (`node cli.js`).

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
# The runtime needs only `node`: drop the bundled package managers (smaller image, and their
# own dependencies no longer show up in vulnerability scans).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Standalone server + static assets (Next.js does not copy these into standalone itself).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Bundled worker and CLI, plus migrations applied at startup.
COPY --from=build --chown=node:node /app/dist/worker.js /app/dist/cli.js ./
COPY --from=build --chown=node:node /app/db/migrations ./db/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/live >/dev/null || exit 1
# Migrations run from instrumentation.ts on boot (MIGRATE_ON_START=true by default).
CMD ["node", "server.js"]
