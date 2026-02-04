import { describe, expect, it } from "vitest";
import { createAdminSessionToken, verifyAdminSessionToken } from "@/lib/admin-session";

describe("admin session token", () => {
  it("creates and verifies session token", () => {
    process.env.ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    const token = createAdminSessionToken("Admin@Example.com", 60);
    const payload = verifyAdminSessionToken(token);
    expect(payload?.email).toBe("admin@example.com");
    expect((payload?.exp ?? 0) > Math.floor(Date.now() / 1000)).toBe(true);
  });

  it("rejects tampered token", () => {
    process.env.ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    const token = createAdminSessionToken("admin@example.com", 60);
    const tampered = `${token}x`;
    expect(verifyAdminSessionToken(tampered)).toBeNull();
  });
});
