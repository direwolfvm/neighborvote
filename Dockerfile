FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/migrations ./migrations
COPY --from=builder --chown=node:node /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=node:node /app/scripts/validate-env.mjs ./scripts/validate-env.mjs
COPY --from=builder --chown=node:node /app/scripts/maintenance.mjs ./scripts/maintenance.mjs
USER node
EXPOSE 8080
CMD ["sh", "-ec", "node scripts/validate-env.mjs; if [ \"${RUN_DB_MIGRATIONS:-0}\" = \"1\" ]; then node scripts/migrate.mjs; fi; exec node server.js"]
