"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  members,
  memberVerificationSessions
} from "@/db/schema";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/email";
import { sendVerificationEmail } from "@/lib/mailer";

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.string().email().max(320)
});

export async function registerMemberAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email")
  });

  if (!parsed.success) {
    redirect("/register?error=invalid_input");
  }

  const fullName = parsed.data.fullName;
  const email = normalizeEmail(parsed.data.email);

  const token = generateOpaqueToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  try {
    await db.transaction(async (tx) => {
      const [member] = await tx
        .insert(members)
        .values({
          fullName,
          email,
          status: "pending_verification"
        })
        .onConflictDoUpdate({
          target: members.email,
          set: {
            fullName
          }
        })
        .returning({ id: members.id, email: members.email });

      await tx.insert(memberVerificationSessions).values({
        memberId: member.id,
        tokenHash,
        expiresAt
      });

      await tx.insert(auditEvents).values({
        electionId: null,
        actor: email,
        action: "member.verification_requested",
        detailsJson: {
          memberId: member.id
        }
      });
    });

    await sendVerificationEmail(email, token);
  } catch {
    redirect("/register?error=send_failed");
  }

  redirect("/register?sent=1");
}

export async function resendVerificationAction(formData: FormData) {
  const rawEmail = z.string().email().safeParse(formData.get("email"));

  if (!rawEmail.success) {
    redirect("/register?error=invalid_input");
  }

  const email = normalizeEmail(rawEmail.data);
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.email, email))
    .limit(1);

  if (!member) {
    redirect("/register?sent=1");
  }

  const token = generateOpaqueToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await db.insert(memberVerificationSessions).values({
    memberId: member.id,
    tokenHash,
    expiresAt
  });

  await sendVerificationEmail(email, token);

  redirect("/register?sent=1");
}
