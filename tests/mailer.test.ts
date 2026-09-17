import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildEmail, type EmailKind } from "@/lib/email-templates";
import { MailDeliveryError, sendEmail, sendTemplatedEmail } from "@/lib/mailer";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://neighborvote.online");
  vi.stubEnv("MAIL_PROVIDER", "mailgun");
  vi.stubEnv("MAILGUN_API_KEY", "test-only-secret");
  vi.stubEnv("MAILGUN_DOMAIN", "neighborvote.online");
  vi.stubEnv("MAIL_FROM", "NeighborVote <no-reply@neighborvote.online>");
  vi.stubEnv("MAILGUN_TEST_MODE", "false");
});
describe("polished private email", () => {
  it.each<EmailKind>(["verification", "member-login", "admin-login", "vote-link", "election-open"])(
    "provides HTML, text, CTA and help for %s",
    (kind) => {
      const email = buildEmail(kind, "https://neighborvote.online/verify?token=sample");
      expect(email.html).toContain('lang="en"');
      expect(email.html).toContain("https://neighborvote.online/verify?token=sample");
      expect(email.text).toContain("https://neighborvote.online/help");
      expect(email.subject.length).toBeLessThan(251);
    }
  );
  it("escapes election labels and URL attributes", () => {
    const email = buildEmail(
      "election-open",
      "https://neighborvote.online/elections/id?a=1&b=2",
      '<img src=x onerror="alert(1)">'
    );
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
    expect(email.html).toContain("&amp;b=2");
  });
  it("rejects links outside the configured application origin", () =>
    expect(() => buildEmail("verification", "https://evil.example/verify")).toThrow());
  it("uses multipart Mailgun requests, disables all tracking, returns acceptance receipt", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "message-id" }));
    vi.stubGlobal("fetch", fetcher);
    expect(
      await sendTemplatedEmail(
        "member@example.com",
        "member-login",
        "https://neighborvote.online/member/login/verify?token=t"
      )
    ).toEqual({ id: "message-id", provider: "mailgun" });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.mailgun.net/v3/neighborvote.online/messages");
    expect(options.body.get("o:tracking-clicks")).toBe("no");
    expect(options.body.get("o:tracking-opens")).toBe("no");
    expect(options.body.get("html")).toContain("Sign in");
    expect(options.body.get("o:testmode")).toBeNull();
    expect(options.signal).toBeDefined();
  });
  it("supports test mode without delivering mail", async () => {
    vi.stubEnv("MAILGUN_TEST_MODE", "true");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "test" }));
    vi.stubGlobal("fetch", fetcher);
    await sendEmail({ to: "member@example.com", subject: "Test", text: "Test" });
    expect(fetcher.mock.calls[0][1].body.get("o:testmode")).toBe("yes");
  });
  it("never exposes provider response bodies in errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("secret-token recipient@example.com", { status: 429 }))
    );
    await expect(
      sendEmail({ to: "member@example.com", subject: "Test", text: "Test" })
    ).rejects.toThrow("Email provider rejected request (429)");
  });
  it("distinguishes uncertain network acceptance from definite rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    try {
      await sendEmail({ to: "member@example.com", subject: "Test", text: "Test" });
      throw new Error("unexpected success");
    } catch (error) {
      expect(error).toBeInstanceOf(MailDeliveryError);
      expect((error as MailDeliveryError).status).toBeNull();
    }
  });
  it("does not send credentials to an untrusted API origin", async () => {
    vi.stubEnv("MAILGUN_API_BASE_URL", "https://evil.example");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      sendEmail({ to: "member@example.com", subject: "Test", text: "Test" })
    ).rejects.toThrow("Invalid Mailgun API origin");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
