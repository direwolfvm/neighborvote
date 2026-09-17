"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { adminLoginTokens, auditEvents, staffRoles } from "@/db/schema";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { normalizeEmail, parseAdminEmails } from "@/lib/email";
import { sendTemplatedEmail } from "@/lib/mailer";
import { allowEmailRequest } from "@/lib/rate-limit";
import { appBaseUrl, safeReturnPath } from "@/lib/urls";

const requestSchema = z.object({
  email: z.string().trim().email().max(320),
  next: z.string().optional()
});

export async function requestAdminLoginAction(formData: FormData) {
  try {
    const parsed = requestSchema.safeParse({
      email: formData.get("email"),
      next: formData.get("next") || undefined
    });

    if (!parsed.success) {
      redirect("/admin/login?error=invalid_email");
    }

    const email = normalizeEmail(parsed.data.email);
    if (!(await allowEmailRequest(email))) redirect("/admin/login?error=rate_limited");
    const nextPath = safeReturnPath(parsed.data.next, "/admin", "/admin");
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

    await sendTemplatedEmail(email, "admin-login", verifyUrl.toString());

    await db.insert(auditEvents).values({
      electionId: null,
      actor: email,
      action: "admin.login_link_requested",
      detailsJson: {
        next: nextPath
      }
    });

    redirect(`/admin/login?sent=1&next=${encodeURIComponent(nextPath)}`);
  } catch (error) {
    unstable_rethrow(error);
    redirect("/admin/login?error=send_failed");
  }
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
  const nextPath = safeReturnPath(parsed.data.next, "/admin", "/admin");

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

  const [currentRole] = await db
    .select({ role: staffRoles.role })
    .from(staffRoles)
    .where(eq(staffRoles.email, tokenRow.email))
    .limit(1);
  if (!currentRole && !parseAdminEmails(process.env.ADMIN_EMAILS).has(tokenRow.email))
    redirect("/admin/login?error=invalid_or_expired");

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
