"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  memberVerificationSessions,
  members
} from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";

const verifySchema = z.object({
  token: z.string().min(20).max(200)
});

export async function verifyMemberAction(formData: FormData) {
  const parsed = verifySchema.safeParse({ token: formData.get("token") });

  if (!parsed.success) {
    redirect("/verify?error=invalid_token");
  }

  const now = new Date();
  const tokenHash = sha256Hex(parsed.data.token);

  const result = await db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        sessionId: memberVerificationSessions.id,
        memberId: memberVerificationSessions.memberId,
        email: members.email
      })
      .from(memberVerificationSessions)
      .innerJoin(members, eq(memberVerificationSessions.memberId, members.id))
      .where(
        and(
          eq(memberVerificationSessions.tokenHash, tokenHash),
          isNull(memberVerificationSessions.usedAt),
          gt(memberVerificationSessions.expiresAt, now)
        )
      )
      .limit(1);

    if (!session) {
      return false;
    }

    const updateSession = await tx
      .update(memberVerificationSessions)
      .set({ usedAt: now })
      .where(
        and(
          eq(memberVerificationSessions.id, session.sessionId),
          isNull(memberVerificationSessions.usedAt)
        )
      )
      .returning({ id: memberVerificationSessions.id });

    if (updateSession.length === 0) {
      return false;
    }

    await tx
      .update(members)
      .set({
        status: "verified",
        verifiedAt: now,
        verificationMethod: "email_link"
      })
      .where(eq(members.id, session.memberId));

    await tx.insert(auditEvents).values({
      electionId: null,
      actor: session.email,
      action: "member.verified",
      detailsJson: {
        memberId: session.memberId
      }
    });

    return true;
  });

  if (!result) {
    redirect("/verify?error=invalid_or_expired");
  }

  redirect("/verify?success=1");
}
