// Exercises the production upgrade and safety gate in a disposable test schema.
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const url = new URL(process.env.TEST_DATABASE_URL || "");
if (
  !["localhost", "127.0.0.1", "postgres"].includes(url.hostname) ||
  url.pathname !== "/neighborvote_test"
)
  throw new Error("Use a disposable local neighborvote_test database");
const schema = `upgrade_check_${Date.now()}`;
const pool = new Pool({ connectionString: url.toString() });
const client = await pool.connect();
try {
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema},public`);
  await client.query(
    "CREATE TABLE __migrations (id serial PRIMARY KEY, filename text NOT NULL UNIQUE, applied_at timestamptz NOT NULL DEFAULT now())"
  );
  const files = [
    "0001_init.sql",
    "0002_admin_login_tokens.sql",
    "0003_election_notifications.sql",
    "0004_member_login_tokens.sql",
    "0005_manual_vote_counts.sql",
    "0006_staff_roles.sql"
  ];
  for (const file of files) {
    await client.query(await readFile(`migrations/${file}`, "utf8"));
    await client.query("INSERT INTO __migrations(filename) VALUES($1)", [file]);
  }
  const {
    rows: [member]
  } = await client.query(
    "INSERT INTO members(full_name,email,status) VALUES('Legacy Neighbor','legacy@example.com','verified') RETURNING id"
  );
  const {
    rows: [election]
  } = await client.query(
    'INSERT INTO elections(name,status,ballot_json,ballot_version) VALUES(\'Legacy election\',\'open\',\'{"title":"Vote","choices":[{"id":"yes","label":"Yes"},{"id":"no","label":"No"}]}\',\'v1\') RETURNING id'
  );
  await client.query(
    "INSERT INTO staff_roles(email,role,added_by) VALUES('staff@example.com','admin','owner@example.com')"
  );
  await client.query(
    "INSERT INTO votes(election_id,member_id,ballot_version,vote_payload_json) VALUES($1,$2,'v1','{\"choiceId\":\"yes\"}')",
    [election.id, member.id]
  );
  url.searchParams.set("options", `-c search_path=${schema},public`);
  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    NODE_ENV: "production",
    ALLOW_COMMUNITY_MIGRATION: "false"
  };
  const gated = spawnSync(process.execPath, ["scripts/migrate.mjs"], { env, encoding: "utf8" });
  if (gated.status === 0 || !gated.stderr.includes("maintenance window"))
    throw new Error("Populated production migration was not gated");
  const allowed = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...env, ALLOW_COMMUNITY_MIGRATION: "true" },
    encoding: "utf8"
  });
  if (allowed.status !== 0) throw new Error("Approved upgrade failed");
  const result = await client.query(
    "SELECT e.community_id, cm.community_id AS membership_community, s.community_id AS staff_community, v.vote_payload_json FROM elections e JOIN votes v ON v.election_id=e.id JOIN community_memberships cm ON cm.member_id=v.member_id CROSS JOIN staff_roles s"
  );
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    row.community_id !== row.membership_community ||
    row.community_id !== row.staff_community ||
    row.vote_payload_json.choiceId !== "yes"
  )
    throw new Error("Legacy records were not preserved");
  const rerun = spawnSync(process.execPath, ["scripts/migrate.mjs"], { env, encoding: "utf8" });
  if (rerun.status !== 0) throw new Error("Migration was not idempotent");
  console.log(
    "Upgrade check passed: maintenance gate, legacy roster/staff/vote preservation, idempotent rerun"
  );
} finally {
  await client.query(`DROP SCHEMA ${schema} CASCADE`);
  client.release();
  await pool.end();
}
