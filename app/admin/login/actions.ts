"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { adminLoginTokens, auditEvents, staffRoles } from "@/db/schema";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { normalizeEmail, parseAdminEmails } from "@/lib/email";
import { sendEmail } from "@/lib/mailer";
import { appBaseUrl } from "@/lib/urls";

const requestSchema = z.object({
  email: z.string().email().max(320),
  next: z.string().optional()
});

export async function requestAdminLoginAction(formData: FormData) {
  const parsed = requestSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") || undefined
  });

  if (!parsed.success) {
    redirect("/admin/login?error=invalid_email");
  }

  const email = normalizeEmail(parsed.data.email);
  const nextPath = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/admin";
  const allowed = parseAdminEmails(process.env.ADMIN_EMAILS);
  const [staffRole] = await db
    .select({ role: staffRoles.role })
    .from(staffRoles)
    .where(eq(staffRoles.email, email))
    .limit(1);

  if (!staffRole && !allowed.has(email)) {
    redirect(`/admin/login?sent=1&next=${encodeURIComponent(nextPath)}`);
  }

  const token = generateOpaqueToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

  await db.insert(adminLoginTokens).values({
    email,
    tokenHash,
    expiresAt
  });

  const verifyUrl = new URL("/admin/login/verify", appBaseUrl());
  verifyUrl.searchParams.set("token", token);
  verifyUrl.searchParams.set("next", nextPath);

  await sendEmail({
    to: email,
    subject: "NeighborVote admin login",
    text: `Use this one-time admin login link: ${verifyUrl.toString()}`
  });

  await db.insert(auditEvents).values({
    electionId: null,
    actor: email,
    action: "admin.login_link_requested",
    detailsJson: {
      next: nextPath
    }
  });

  redirect(`/admin/login?sent=1&next=${encodeURIComponent(nextPath)}`);
}

const verifySchema = z.object({
  token: z.string().min(20).max(200),
  next: z.string().optional()
});

export async function verifyAdminLoginAction(formData: FormData) {
  const parsed = verifySchema.safeParse({
    token: formData.get("token"),
    next: formData.get("next") || undefined
  });

  if (!parsed.success) {
    redirect("/admin/login?error=invalid_token");
  }

  const tokenHash = sha256Hex(parsed.data.token);
  const now = new Date();
  const nextPath = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/admin";

  const [tokenRow] = await db
    .select({ id: adminLoginTokens.id, email: adminLoginTokens.email })
    .from(adminLoginTokens)
    .where(
      and(
        eq(adminLoginTokens.tokenHash, tokenHash),
        isNull(adminLoginTokens.usedAt),
        gt(adminLoginTokens.expiresAt, now)
      )
    )
    .limit(1);

  if (!tokenRow) {
    redirect("/admin/login?error=invalid_or_expired");
  }

  const updated = await db
    .update(adminLoginTokens)
    .set({ usedAt: now })
    .where(and(eq(adminLoginTokens.id, tokenRow.id), isNull(adminLoginTokens.usedAt)))
    .returning({ id: adminLoginTokens.id });

  if (updated.length === 0) {
    redirect("/admin/login?error=invalid_or_expired");
  }

  const sessionToken = createAdminSessionToken(tokenRow.email);
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8
  });

  await db.insert(auditEvents).values({
    electionId: null,
    actor: tokenRow.email,
    action: "admin.logged_in",
    detailsJson: {
      next: nextPath
    }
  });

  redirect(nextPath);
}

export async function adminLogoutAction() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0
  });

  redirect("/admin/login?logged_out=1");
}
