"use server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect, unstable_rethrow } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  memberVerificationSessions,
  members,
  communities,
  communityMemberships
} from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { evaluateCommunityRules } from "@/lib/community-rules";
import { createMemberSessionToken, MEMBER_SESSION_COOKIE } from "@/lib/member-session";

export async function verifyMemberAction(formData: FormData) {
  const parsed = z.string().min(20).max(200).safeParse(formData.get("token"));
  if (!parsed.success) redirect("/verify?error=invalid_token");
  try {
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const [session] = await tx
        .select({
          id: memberVerificationSessions.id,
          memberId: members.id,
          email: members.email,
          status: members.status,
          communityId: communities.id,
          rules: communities.rulesJson,
          answers: memberVerificationSessions.answersJson
        })
        .from(memberVerificationSessions)
        .innerJoin(members, eq(memberVerificationSessions.memberId, members.id))
        .innerJoin(communities, eq(memberVerificationSessions.communityId, communities.id))
        .where(
          and(
            eq(memberVerificationSessions.tokenHash, sha256Hex(parsed.data)),
            isNull(memberVerificationSessions.usedAt),
            gt(memberVerificationSessions.expiresAt, now)
          )
        )
        .limit(1)
        .for("update");
      if (
        !session ||
        session.status === "inactive" ||
        !evaluateCommunityRules(session.rules, session.email, session.answers, true).allowed
      )
        return null;
      const [membership] = await tx
        .select()
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, session.communityId),
            eq(communityMemberships.memberId, session.memberId)
          )
        )
        .limit(1)
        .for("update");
      if (membership?.status === "excluded") return null;
      await tx
        .update(memberVerificationSessions)
        .set({ usedAt: now })
        .where(eq(memberVerificationSessions.id, session.id));
      if (session.status === "pending_verification")
        await tx
          .update(members)
          .set({ status: "verified", verifiedAt: now, verificationMethod: "email_link" })
          .where(eq(members.id, session.memberId));
      await tx
        .insert(communityMemberships)
        .values({
          communityId: session.communityId,
          memberId: session.memberId,
          answersJson: session.answers
        })
        .onConflictDoUpdate({
          target: [communityMemberships.communityId, communityMemberships.memberId],
          set: { answersJson: session.answers }
        });
      await tx
        .insert(auditEvents)
        .values({
          actor: session.email,
          action: "community.member_verified",
          detailsJson: { memberId: session.memberId, communityId: session.communityId }
        });
      return session;
    });
    if (!result) redirect("/verify?error=invalid_or_expired");
    const cookieStore = await cookies();
    cookieStore.set({
      name: MEMBER_SESSION_COOKIE,
      value: createMemberSessionToken(result.memberId, result.email),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 604800
    });
  } catch (error) {
    unstable_rethrow(error);
    redirect("/verify?error=unavailable");
  }
  redirect("/member?verified=1");
}
