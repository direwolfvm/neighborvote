import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { staffRoles } from "@/db/schema";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { normalizeEmail, parseAdminEmails } from "@/lib/email";

export type StaffRole = "admin" | "election_manager";

export interface AdminActor {
  email: string;
  role: StaffRole;
  source: "db" | "env";
}

async function getSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const payload = sessionValue ? verifyAdminSessionToken(sessionValue) : null;
  return payload?.email ? normalizeEmail(payload.email) : null;
}

export async function getAdminActor(): Promise<AdminActor> {
  const actorEmail = await getSessionEmail();
  if (!actorEmail) {
    throw new Error("Admin access denied.");
  }

  const [dbRole] = await db
    .select({ role: staffRoles.role })
    .from(staffRoles)
    .where(eq(staffRoles.email, actorEmail))
    .limit(1);

  if (dbRole) {
    return { email: actorEmail, role: dbRole.role, source: "db" };
  }

  const allowedAdmins = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (allowedAdmins.has(actorEmail)) {
    return { email: actorEmail, role: "admin", source: "env" };
  }

  throw new Error("Admin access denied.");
}

export async function getAdminActorEmail(): Promise<string> {
  const actor = await getAdminActor();
  return actor.email;
}

export async function assertAdminAccess(): Promise<void> {
  await getAdminActor();
}

export async function assertAdminRoleAccess(): Promise<void> {
  const actor = await getAdminActor();
  if (actor.role !== "admin") {
    throw new Error("Admin role required.");
  }
}
