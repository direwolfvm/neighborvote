import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { elections, staffRoles } from "@/db/schema";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { normalizeEmail, parseAdminEmails } from "@/lib/email";

export type StaffRole = "admin" | "election_manager";

export interface AdminActor {
  email: string;
  role: StaffRole;
  source: "db" | "env";
  communityId: string | null;
}

async function getSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const payload = sessionValue ? verifyAdminSessionToken(sessionValue) : null;
  return payload?.email ? normalizeEmail(payload.email) : null;
}

export async function getAdminActor(communityId?: string): Promise<AdminActor> {
  const actorEmail = await getSessionEmail();
  if (!actorEmail) {
    throw new Error("Admin access denied.");
  }

  const allowedAdmins = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (allowedAdmins.has(actorEmail))
    return { email: actorEmail, role: "admin", source: "env", communityId: null };

  const [dbRole] = await db
    .select({ role: staffRoles.role, communityId: staffRoles.communityId })
    .from(staffRoles)
    .where(
      and(
        eq(staffRoles.email, actorEmail),
        communityId ? eq(staffRoles.communityId, communityId) : undefined
      )
    )
    .limit(1);

  if (dbRole) {
    return { email: actorEmail, role: dbRole.role, source: "db", communityId: dbRole.communityId };
  }

  throw new Error("Admin access denied.");
}

export async function getAdminActorEmail(communityId?: string): Promise<string> {
  const actor = await getAdminActor(communityId);
  return actor.email;
}

export async function assertAdminAccess(communityId?: string): Promise<void> {
  await getAdminActor(communityId);
}

export async function assertAdminRoleAccess(communityId?: string): Promise<void> {
  const actor = await getAdminActor(communityId);
  if (actor.role !== "admin") {
    throw new Error("Admin role required.");
  }
}

export async function getElectionActor(electionId: string): Promise<AdminActor> {
  const [election] = await db
    .select({ communityId: elections.communityId })
    .from(elections)
    .where(eq(elections.id, electionId))
    .limit(1);
  if (!election) throw new Error("Election not found.");
  return getAdminActor(election.communityId);
}
