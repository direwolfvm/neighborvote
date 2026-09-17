import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

// Match Next.js local environment loading without overriding injected deployment secrets.
if (!process.env.DATABASE_URL) {
  const { default: nextEnv } = await import("@next/env");
  nextEnv.loadEnvConfig(process.cwd());
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

async function main() {
  const migrationsDir = path.join(process.cwd(), "migrations");
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(781443219)");
    await client.query(
      `CREATE TABLE IF NOT EXISTS __migrations (
        id serial PRIMARY KEY,
        filename text NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      );`
    );

    const result = await client.query("SELECT filename FROM __migrations");
    const applied = new Set(result.rows.map((row) => row.filename));

    for (const file of files) {
      if (applied.has(file)) continue;
      if (
        file === "0008_communities.sql" &&
        process.env.NODE_ENV === "production" &&
        process.env.ALLOW_COMMUNITY_MIGRATION !== "true"
      ) {
        const legacy = await client.query(
          "SELECT EXISTS (SELECT 1 FROM members) OR EXISTS (SELECT 1 FROM elections) OR EXISTS (SELECT 1 FROM staff_roles) AS populated"
        );
        if (legacy.rows[0].populated)
          throw new Error(
            "Community migration requires a maintenance window and backup. Stop old-revision writes, then set ALLOW_COMMUNITY_MIGRATION=true for this migration job."
          );
      }
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO __migrations (filename) VALUES ($1)", [file]);
      console.log(`Applied migration ${file}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : "Unknown error");
  process.exit(1);
});
