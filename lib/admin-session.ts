import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const sessionPayloadSchema = z.object({
  email: z.string().email(),
  exp: z.number().int().positive()
});

export const ADMIN_SESSION_COOKIE = "nv_admin_session";

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be set and at least 32 characters");
  }
  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createAdminSessionToken(email: string, ttlSeconds = 60 * 60 * 8): string {
  const payload = {
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(token: string): { email: string; exp: number } | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSig = sign(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSig);
  const gotBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== gotBuffer.length) return null;
  if (!timingSafeEqual(expectedBuffer, gotBuffer)) return null;

  try {
    const payload = sessionPayloadSchema.parse(JSON.parse(base64UrlDecode(encodedPayload)));
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
