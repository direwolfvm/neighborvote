import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { parseAdminEmails } from "@/lib/email";

export async function getAdminActorEmail(): Promise<string> {
  const allowed = parseAdminEmails(process.env.ADMIN_EMAILS);
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const payload = sessionValue ? verifyAdminSessionToken(sessionValue) : null;
  const actorEmail = payload?.email?.toLowerCase().trim();

  if (!actorEmail || !allowed.has(actorEmail)) {
    throw new Error("Admin access denied.");
  }

  return actorEmail;
}

export async function assertAdminAccess(): Promise<void> {
  await getAdminActorEmail();
}
