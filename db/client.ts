import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
}

const pool =
  globalThis.__dbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL
  });
if (process.env.NODE_ENV !== "production") globalThis.__dbPool = pool;

export const db = drizzle(pool, { schema });
