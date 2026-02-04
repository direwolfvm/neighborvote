import { headers } from "next/headers";
import { parseAdminEmails } from "@/lib/email";

export async function getAdminActorEmail(): Promise<string> {
  const allowed = parseAdminEmails(process.env.ADMIN_EMAILS);
  const requestHeaders = await headers();
  const actorEmail = requestHeaders.get("x-admin-email")?.toLowerCase().trim();

  if (!actorEmail || !allowed.has(actorEmail)) {
    throw new Error("Admin access denied. Provide x-admin-email header matching ADMIN_EMAILS.");
  }

  return actorEmail;
}

export async function assertAdminAccess(): Promise<void> {
  await getAdminActorEmail();
}
