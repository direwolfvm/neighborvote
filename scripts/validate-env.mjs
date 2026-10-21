// Runtime preflight: check names only; never print configuration values.
const required = [
  "DATABASE_URL",
  "APP_BASE_URL",
  "ADMIN_EMAILS",
  "ADMIN_SESSION_SECRET",
  "MEMBER_SESSION_SECRET",
  "MAIL_FROM",
  "MAILGUN_API_KEY",
  "MAILGUN_DOMAIN",
  "GCS_EXPORT_BUCKET"
];
const invalid = required.filter(
  (name) => !process.env[name]?.trim() || /^(replace-|key-xxxx|<)/.test(process.env[name])
);
for (const key of ["ADMIN_SESSION_SECRET", "MEMBER_SESSION_SECRET"])
  if ((process.env[key]?.length || 0) < 32) invalid.push(key);
// The notification cron authenticates with Cloud Scheduler's ID token (CRON_INVOKER_EMAIL)
// or the legacy x-cron-token (CRON_JOB_TOKEN); at least one must be configured.
const cronToken = process.env.CRON_JOB_TOKEN?.trim();
const cronInvoker = process.env.CRON_INVOKER_EMAIL?.trim();
if (cronToken && (cronToken.length < 32 || /^replace-/.test(cronToken))) invalid.push("CRON_JOB_TOKEN");
if (!cronToken && !cronInvoker) invalid.push("CRON_JOB_TOKEN or CRON_INVOKER_EMAIL");
try {
  const url = new URL(process.env.APP_BASE_URL);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    invalid.push("APP_BASE_URL");
} catch {
  invalid.push("APP_BASE_URL");
}
if (process.env.MAILGUN_TEST_MODE === "true")
  invalid.push("MAILGUN_TEST_MODE must be false for production");
if (invalid.length) {
  console.error("Invalid production configuration:", [...new Set(invalid)].join(", "));
  process.exit(1);
}
console.log("Production configuration preflight passed");
