import { describe, expect, it } from "vitest";
import { createMemberSessionToken, verifyMemberSessionToken } from "@/lib/member-session";

describe("member session token", () => {
  it("creates and verifies token", () => {
    process.env.MEMBER_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    const token = createMemberSessionToken("00000000-0000-0000-0000-000000000000", "Member@Example.com", 60);
    const payload = verifyMemberSessionToken(token);
    expect(payload?.memberId).toBe("00000000-0000-0000-0000-000000000000");
    expect(payload?.email).toBe("member@example.com");
  });

  it("rejects tampered tokens", () => {
    process.env.MEMBER_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    const token = createMemberSessionToken("00000000-0000-0000-0000-000000000000", "member@example.com", 60);
    expect(verifyMemberSessionToken(`${token}x`)).toBeNull();
  });
});
