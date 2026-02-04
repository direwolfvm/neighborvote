import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseAdminEmails } from "@/lib/email";

const ADMIN_SESSION_COOKIE = "nv_admin_session";

function isPublicAdminPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname === "/admin/login/verify";
}

function base64UrlToBase64(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return padded + "=".repeat(padLength);
}

function decodePayload(encodedPayload: string): { email: string; exp: number } | null {
  try {
    const json = atob(base64UrlToBase64(encodedPayload));
    const parsed = JSON.parse(json) as { email?: string; exp?: number };
    if (typeof parsed.email !== "string" || typeof parsed.exp !== "number") return null;
    return { email: parsed.email.toLowerCase(), exp: parsed.exp };
  } catch {
    return null;
  }
}

async function verifySessionToken(token: string): Promise<{ email: string; exp: number } | null> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const payload = decodePayload(encodedPayload);
  if (!payload) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedSigRaw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(expectedSigRaw)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  if (expectedSig !== signature) return null;
  return payload;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  if (isPublicAdminPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  const allowed = parseAdminEmails(process.env.ADMIN_EMAILS);

  if (!payload || !allowed.has(payload.email.toLowerCase())) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
