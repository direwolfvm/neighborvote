import { spawnSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error("Set TEST_DATABASE_URL to a disposable local database named neighborvote_test");
const parsed = new URL(url);
if (
  !["localhost", "127.0.0.1", "postgres"].includes(parsed.hostname) ||
  parsed.pathname !== "/neighborvote_test"
)
  throw new Error("Integration tests require a disposable local neighborvote_test database");
const env = {
  ...process.env,
  DATABASE_URL: url,
  APP_BASE_URL: "http://localhost:3000",
  NODE_ENV: "test",
  ADMIN_EMAILS: "admin@example.com",
  ADMIN_SESSION_SECRET: "test-admin-session-secret-at-least-32-characters",
  MEMBER_SESSION_SECRET: "test-member-session-secret-at-least-32-characters"
};
for (const [command, args] of [
  [process.execPath, ["scripts/migrate.mjs"]],
  [process.execPath, ["scripts/check-upgrade.mjs"]],
  [
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "tests/database.integration.test.ts"]
  ]
]) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
