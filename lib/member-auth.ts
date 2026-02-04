import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { members } from "@/db/schema";
import { MEMBER_SESSION_COOKIE, verifyMemberSessionToken } from "@/lib/member-session";

export async function getMemberFromSession() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(MEMBER_SESSION_COOKIE)?.value;
  const payload = sessionValue ? verifyMemberSessionToken(sessionValue) : null;
  if (!payload) return null;

  const [member] = await db
    .select({ id: members.id, fullName: members.fullName, email: members.email, status: members.status })
    .from(members)
    .where(eq(members.id, payload.memberId))
    .limit(1);

  return member ?? null;
}
