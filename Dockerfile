FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs

EXPOSE 8080

CMD ["sh", "-c", "if [ \"${RUN_DB_MIGRATIONS:-1}\" = \"1\" ]; then node scripts/migrate.mjs; fi; node server.js"]
