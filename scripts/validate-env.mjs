// Runtime preflight: check names only; never print configuration values.
const required = [
  "DATABASE_URL",
  "APP_BASE_URL",
  "ADMIN_EMAILS",
  "ADMIN_SESSION_SECRET",
  "MEMBER_SESSION_SECRET",
  "CRON_JOB_TOKEN",
  "MAIL_FROM",
  "MAILGUN_API_KEY",
  "MAILGUN_DOMAIN",
  "GCS_EXPORT_BUCKET"
];
const invalid = required.filter(
  (name) => !process.env[name]?.trim() || /^(replace-|key-xxxx|<)/.test(process.env[name])
);
for (const key of ["ADMIN_SESSION_SECRET", "MEMBER_SESSION_SECRET", "CRON_JOB_TOKEN"])
  if ((process.env[key]?.length || 0) < 32) invalid.push(key);
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
