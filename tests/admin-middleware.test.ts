import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { createAdminSessionToken } from "@/lib/admin-session";
import { middleware } from "@/middleware";

function requestWith(token?: string) {
  const request = new NextRequest("https://neighborvote.test/admin/elections");
  if (token) request.cookies.set("nv_admin_session", token);
  return request;
}

const isRedirectToLogin = (response: Response) =>
  response.status === 307 && (response.headers.get("location") ?? "").includes("/admin/login");

describe("admin middleware", () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = "a".repeat(40);
  });

  it("lets a valid admin session through", async () => {
    const response = await middleware(requestWith(createAdminSessionToken("staff@example.com")));
    expect(isRedirectToLogin(response)).toBe(false);
  });

  it("redirects without a session", async () => {
    expect(isRedirectToLogin(await middleware(requestWith()))).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const token = createAdminSessionToken("staff@example.com");
    const [payload, signature] = token.split(".");
    const flipped = (signature.startsWith("A") ? "B" : "A") + signature.slice(1);
    expect(isRedirectToLogin(await middleware(requestWith(`${payload}.${flipped}`)))).toBe(true);
  });

  it("rejects a token signed with another secret", async () => {
    const token = createAdminSessionToken("staff@example.com");
    process.env.ADMIN_SESSION_SECRET = "b".repeat(40);
    expect(isRedirectToLogin(await middleware(requestWith(token)))).toBe(true);
  });

  it("rejects a signature that is not base64url", async () => {
    const [payload] = createAdminSessionToken("staff@example.com").split(".");
    expect(isRedirectToLogin(await middleware(requestWith(`${payload}.%%%`)))).toBe(true);
  });
});
