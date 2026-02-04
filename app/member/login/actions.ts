"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, memberLoginTokens, members } from "@/db/schema";
import { MEMBER_SESSION_COOKIE, createMemberSessionToken } from "@/lib/member-session";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/email";
import { sendEmail } from "@/lib/mailer";
import { appBaseUrl } from "@/lib/urls";

const requestSchema = z.object({
  email: z.string().email().max(320)
});

export async function requestMemberLoginAction(formData: FormData) {
  const parsed = requestSchema.safeParse({
    email: formData.get("email")
  });

  if (!parsed.success) {
    redirect("/member/login?error=invalid_email");
  }

  const email = normalizeEmail(parsed.data.email);

  const [member] = await db
    .select({ id: members.id, status: members.status })
    .from(members)
    .where(eq(members.email, email))
    .limit(1);

  if (!member || member.status !== "verified") {
    redirect("/member/login?sent=1");
  }

  const token = generateOpaqueToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await db.insert(memberLoginTokens).values({
    memberId: member.id,
    tokenHash,
    expiresAt
  });

  const verifyUrl = new URL("/member/login/verify", appBaseUrl());
  verifyUrl.searchParams.set("token", token);

  await sendEmail({
    to: email,
    subject: "NeighborVote member login",
    text: `Use this one-time login link: ${verifyUrl.toString()}`
  });

  await db.insert(auditEvents).values({
    electionId: null,
    actor: email,
    action: "member.login_link_requested",
    detailsJson: {
      memberId: member.id
    }
  });

  redirect("/member/login?sent=1");
}

const verifySchema = z.object({
  token: z.string().min(20).max(200)
});

export async function verifyMemberLoginAction(formData: FormData) {
  const parsed = verifySchema.safeParse({
    token: formData.get("token")
  });

  if (!parsed.success) {
    redirect("/member/login?error=invalid_token");
  }

  const tokenHash = sha256Hex(parsed.data.token);
  const now = new Date();

  const [tokenRow] = await db
    .select({
      id: memberLoginTokens.id,
      memberId: memberLoginTokens.memberId,
      email: members.email
    })
    .from(memberLoginTokens)
    .innerJoin(members, eq(memberLoginTokens.memberId, members.id))
    .where(
      and(
        eq(memberLoginTokens.tokenHash, tokenHash),
        isNull(memberLoginTokens.usedAt),
        gt(memberLoginTokens.expiresAt, now)
      )
    )
    .limit(1);

  if (!tokenRow) {
    redirect("/member/login?error=invalid_or_expired");
  }

  const updated = await db
    .update(memberLoginTokens)
    .set({ usedAt: now })
    .where(and(eq(memberLoginTokens.id, tokenRow.id), isNull(memberLoginTokens.usedAt)))
    .returning({ id: memberLoginTokens.id });

  if (updated.length === 0) {
    redirect("/member/login?error=invalid_or_expired");
  }

  const sessionToken = createMemberSessionToken(tokenRow.memberId, tokenRow.email);
  const cookieStore = await cookies();
  cookieStore.set({
    name: MEMBER_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });

  await db.insert(auditEvents).values({
    electionId: null,
    actor: tokenRow.email,
    action: "member.logged_in",
    detailsJson: {
      memberId: tokenRow.memberId
    }
  });

  redirect("/member");
}

export async function memberLogoutAction() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: MEMBER_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0
  });

  redirect("/member/login?logged_out=1");
}
