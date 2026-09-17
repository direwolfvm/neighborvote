import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
loadEnvConfig(process.cwd());
async function main() {
  // This command always uses provider test mode; it never delivers a message.
  process.env.MAILGUN_TEST_MODE = "true";
  process.env.APP_BASE_URL = "https://neighborvote.online";
  const { buildEmail } = await import("@/lib/email-templates");
  const { sendEmail } = await import("@/lib/mailer");
  const template = buildEmail(
    "verification",
    "https://neighborvote.online/verify?token=preview-only-not-a-real-token"
  );
  await mkdir("output/email", { recursive: true });
  await writeFile("output/email/verification.html", template.html);
  const receipt = await sendEmail({
    to: "test@example.com",
    ...template,
    tag: "neighborvote-preflight"
  });
  console.log(
    JSON.stringify({
      provider: receipt.provider,
      accepted: true,
      testMode: true,
      delivered: false,
      preview: "output/email/verification.html"
    })
  );
}
main().catch(() => {
  console.error("Mailgun preflight failed; check the API key, sender, domain, and region.");
  process.exit(1);
});
