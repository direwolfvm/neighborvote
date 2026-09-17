import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

declare global {
  var __dbPool: Pool | undefined;
}

export const pool =
  globalThis.__dbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 20000
  });
if (!globalThis.__dbPool) pool.on("error", () => console.error("Database pool connection error"));
if (process.env.NODE_ENV !== "production") globalThis.__dbPool = pool;

export const db = drizzle(pool, { schema });
