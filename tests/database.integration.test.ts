import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
const state = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => (state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined),
    set: ({ name, value }: { name: string; value: string }) => state.cookies.set(name, value)
  }),
  headers: async () => new Headers()
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  unstable_rethrow: (error: Error) => {
    if (error.message.startsWith("REDIRECT:")) throw error;
  }
}));
vi.mock("@/lib/mailer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mailer")>();
  return {
    ...actual,
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendTemplatedEmail: vi.fn().mockResolvedValue({ id: "test-message", provider: "mailgun" })
  };
});
import { db, pool } from "@/db/client";
import {
  communities,
  communityMemberships,
  elections,
  members,
  staffRoles,
  voteSessions,
  votes,
  memberVerificationSessions,
  electionNotifications,
  manualVoteCounts
} from "@/db/schema";
import { registerMemberAction } from "@/app/register/actions";
import { verifyMemberAction } from "@/app/verify/actions";
import { castVoteAction, requestVoteLinkAction } from "@/app/elections/[id]/actions";
import { removeCommunityStaffAction } from "@/app/admin/community-actions";
import { getElectionActor } from "@/lib/admin";
import { createAdminSessionToken, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { allowEmailRequest } from "@/lib/rate-limit";
import { MailDeliveryError, sendTemplatedEmail, sendVerificationEmail } from "@/lib/mailer";
import {
  dispatchOpenElectionNotifications,
  queueOpenElectionNotifications
} from "@/lib/notifications";
import {
  updateElectionAction,
  setEligibilityAction,
  setManualVoteCountsAction
} from "@/app/admin/actions";
const enabled = Boolean(process.env.TEST_DATABASE_URL);
function form(data: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [key, val] of Object.entries(data))
    for (const value of Array.isArray(val) ? val : [val]) f.append(key, value);
  return f;
}
async function location(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "no redirect";
  } catch (error) {
    const message = (error as Error).message;
    if (!message.startsWith("REDIRECT:")) throw error;
    return message.slice(9);
  }
}
let alpha: string;
let beta: string;
let memberId: string;
let electionId: string;
const ballot = {
  title: "Choose one",
  choices: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" }
  ]
};
async function tokenFor(election = electionId) {
  const token = generateOpaqueToken();
  await db.insert(voteSessions).values({
    electionId: election,
    memberId,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + 600000)
  });
  return token;
}
async function cast(token: string, choiceId = "yes") {
  return location(castVoteAction(form({ electionId, token, choiceId })));
}

describe.skipIf(!enabled)("Postgres production integrity", () => {
  beforeEach(async () => {
    const check = await db.execute(sql`SELECT current_database() AS name`);
    if (check.rows[0]?.name !== "neighborvote_test")
      throw new Error("Refusing to reset non-test database");
    await db.execute(
      sql`TRUNCATE communities, members, audit_events, email_rate_limits, admin_login_tokens CASCADE`
    );
    vi.clearAllMocks();
    state.cookies.clear();
    vi.mocked(sendTemplatedEmail)
      .mockReset()
      .mockResolvedValue({ id: "test-message", provider: "mailgun" });
    const [a, b] = await db
      .insert(communities)
      .values([
        { slug: "alpha", name: "Alpha" },
        { slug: "beta", name: "Beta" }
      ])
      .returning();
    alpha = a.id;
    beta = b.id;
    const [m] = await db
      .insert(members)
      .values({ fullName: "Existing Neighbor", email: "member@example.com", status: "verified" })
      .returning();
    memberId = m.id;
    await db.insert(communityMemberships).values({ communityId: alpha, memberId });
    const [e] = await db
      .insert(elections)
      .values({
        communityId: alpha,
        name: "Alpha vote",
        status: "open",
        ballotVersion: "v1",
        ballotJson: ballot
      })
      .returning();
    electionId = e.id;
  });
  afterAll(async () => {
    await pool.end();
  });
  it("self-registers without approval, proves email once, and scopes membership", async () => {
    expect(
      await location(
        registerMemberAction(
          form({ fullName: "New Neighbor", email: "new@example.com", community: "alpha" })
        )
      )
    ).toContain("sent=1");
    const token = vi.mocked(sendVerificationEmail).mock.calls[0][1];
    expect(await location(verifyMemberAction(form({ token })))).toBe("/member?verified=1");
    const [m] = await db.select().from(members).where(eq(members.email, "new@example.com"));
    expect(m.status).toBe("verified");
    const memberships = await db
      .select()
      .from(communityMemberships)
      .where(eq(communityMemberships.memberId, m.id));
    expect(memberships.map((x) => x.communityId)).toEqual([alpha]);
    expect(await location(verifyMemberAction(form({ token })))).toContain("invalid_or_expired");
  });
  it("does not overwrite another member's name or join another community without email confirmation", async () => {
    await location(
      registerMemberAction(
        form({ fullName: "Impostor Name", email: "member@example.com", community: "beta" })
      )
    );
    const [m] = await db.select().from(members).where(eq(members.id, memberId));
    expect(m.fullName).toBe("Existing Neighbor");
    expect(
      await db.select().from(communityMemberships).where(eq(communityMemberships.communityId, beta))
    ).toHaveLength(0);
    const token = vi.mocked(sendVerificationEmail).mock.calls[0][1];
    await location(verifyMemberAction(form({ token })));
    expect(
      await db.select().from(communityMemberships).where(eq(communityMemberships.communityId, beta))
    ).toHaveLength(1);
  });
  it("rejects registration conditions before creating an account or sending email", async () => {
    await db
      .update(communities)
      .set({ rulesJson: { allowedPostalCodes: ["22301"] } })
      .where(eq(communities.id, alpha));
    const url = await location(
      registerMemberAction(
        form({
          fullName: "Outside Neighbor",
          email: "outside@example.com",
          community: "alpha",
          postalCode: "90210"
        })
      )
    );
    expect(url).toContain("not_eligible");
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(
      await db.select().from(members).where(eq(members.email, "outside@example.com"))
    ).toHaveLength(0);
  });
  it("does not reactivate inactive accounts or excluded memberships", async () => {
    await db.update(members).set({ status: "inactive" }).where(eq(members.id, memberId));
    await location(
      registerMemberAction(
        form({ fullName: "Name", email: "member@example.com", community: "alpha" })
      )
    );
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    await db.update(members).set({ status: "verified" }).where(eq(members.id, memberId));
    const token = generateOpaqueToken();
    await db.insert(memberVerificationSessions).values({
      memberId,
      communityId: alpha,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + 600000)
    });
    await db
      .update(communityMemberships)
      .set({ status: "excluded" })
      .where(eq(communityMemberships.memberId, memberId));
    expect(await location(verifyMemberAction(form({ token })))).toContain("invalid_or_expired");
  });
  it("rechecks changed rules when consuming verification and voting links", async () => {
    const token = await tokenFor();
    await db
      .update(communities)
      .set({ rulesJson: { blockedEmails: ["member@example.com"] } })
      .where(eq(communities.id, alpha));
    expect(await cast(token)).toContain("not_eligible");
    expect(await db.select().from(votes)).toHaveLength(0);
    const [session] = await db.select().from(voteSessions);
    expect(session.usedAt).toBeNull();
  });
  it("blocks cross-community ballot requests and casting even with a forged session row", async () => {
    await db.update(elections).set({ communityId: beta }).where(eq(elections.id, electionId));
    await location(
      requestVoteLinkAction(form({ electionId, email: "member@example.com", returnTo: "/member" }))
    );
    expect(sendTemplatedEmail).not.toHaveBeenCalled();
    expect(await cast(await tokenFor())).toContain("not_eligible");
  });
  it("records exactly one vote under concurrent distinct token submissions", async () => {
    const [one, two] = await Promise.all([tokenFor(), tokenFor()]);
    const results = await Promise.all([cast(one), cast(two)]);
    expect(results.filter((url) => url.includes("receipt="))).toHaveLength(1);
    expect(results.filter((url) => url.includes("already_voted"))).toHaveLength(1);
    expect(await db.select().from(votes)).toHaveLength(1);
  });
  it("preserves a link after an invalid choice and blocks reuse after success", async () => {
    const token = await tokenFor();
    expect(await cast(token, "invalid")).toContain("invalid_choice");
    expect(await cast(token)).toContain("receipt=");
    expect(await cast(token)).toContain("invalid_or_expired");
  });
  it("enforces one email request per recipient per minute across concurrent instances", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => allowEmailRequest("rate@example.com"))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("authorizes staff by the target election's community", async () => {
    await db.insert(staffRoles).values({
      communityId: alpha,
      email: "manager@example.com",
      role: "election_manager",
      addedBy: "admin@example.com"
    });
    state.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken("manager@example.com"));
    expect((await getElectionActor(electionId)).communityId).toBe(alpha);
    await db.update(elections).set({ communityId: beta }).where(eq(elections.id, electionId));
    await expect(getElectionActor(electionId)).rejects.toThrow("Admin access denied");
    await expect(
      setEligibilityAction(
        form({ electionId, memberEmail: "member@example.com", eligible: "true" })
      )
    ).rejects.toThrow("Admin access denied");
    await expect(updateElectionAction(form({ electionId }))).rejects.toThrow("Admin access denied");
  });
  it("revokes a removed community staff member's existing session", async () => {
    await db.insert(staffRoles).values({
      communityId: alpha,
      email: "manager@example.com",
      role: "election_manager",
      addedBy: "admin@example.com"
    });
    const managerSession = createAdminSessionToken("manager@example.com");
    state.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken("admin@example.com"));
    await location(
      removeCommunityStaffAction(form({ communityId: alpha, email: "manager@example.com" }))
    );
    state.cookies.set(ADMIN_SESSION_COOKIE, managerSession);
    await expect(getElectionActor(electionId)).rejects.toThrow("Admin access denied");
  });
  it("snapshots only community members and claims each email once across concurrent jobs", async () => {
    const [outsider] = await db
      .insert(members)
      .values({ fullName: "Other", email: "other@example.com", status: "verified" })
      .returning();
    await db.insert(communityMemberships).values({ communityId: beta, memberId: outsider.id });
    await Promise.all([queueOpenElectionNotifications(), queueOpenElectionNotifications()]);
    expect(await db.select().from(electionNotifications)).toHaveLength(1);
    await Promise.all([dispatchOpenElectionNotifications(), dispatchOpenElectionNotifications()]);
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(1);
    const [e] = await db.select().from(elections);
    expect(e.notificationSentCount).toBe(1);
    expect(e.notificationSentAt).not.toBeNull();
  });
  it("retries a rejected recipient without resending successful recipients", async () => {
    const [other] = await db
      .insert(members)
      .values({ fullName: "Other", email: "other@example.com", status: "verified" })
      .returning();
    await db.insert(communityMemberships).values({ communityId: alpha, memberId: other.id });
    vi.mocked(sendTemplatedEmail).mockRejectedValueOnce(new MailDeliveryError(429));
    await dispatchOpenElectionNotifications();
    const rows = await db.select().from(electionNotifications);
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "sent"]);
    await db
      .update(electionNotifications)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(electionNotifications.status, "failed"));
    await dispatchOpenElectionNotifications();
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(3);
    expect((await db.select().from(electionNotifications)).every((n) => n.status === "sent")).toBe(
      true
    );
  });
  it("does not automatically resend uncertain delivery", async () => {
    vi.mocked(sendTemplatedEmail).mockRejectedValueOnce(new MailDeliveryError(null));
    await dispatchOpenElectionNotifications();
    await dispatchOpenElectionNotifications();
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(1);
    expect((await db.select().from(electionNotifications))[0].status).toBe("uncertain");
  });
  it("applies election-specific exclusions without affecting another community", async () => {
    state.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken("admin@example.com"));
    await location(
      setEligibilityAction(
        form({ electionId, memberEmail: "member@example.com", eligible: "false" })
      )
    );
    expect(await cast(await tokenFor())).toContain("not_eligible");
  });
  it("locks scheduled ballots once their opening time has passed", async () => {
    state.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken("admin@example.com"));
    await db
      .update(elections)
      .set({ status: "scheduled", opensAt: new Date(Date.now() - 60000) })
      .where(eq(elections.id, electionId));
    const changed = {
      title: "Different question",
      choices: [
        { id: "a", label: "A" },
        { id: "b", label: "B" }
      ]
    };
    await location(
      updateElectionAction(
        form({
          electionId,
          name: "Changed",
          description: "",
          ballotVersion: "v2",
          ballotJson: JSON.stringify(changed),
          status: "scheduled"
        })
      )
    );
    const [e] = await db.select().from(elections).where(eq(elections.id, electionId));
    expect(e.ballotJson).toEqual(ballot);
    expect(e.ballotVersion).toBe("v1");
  });
  it("records valid manual totals for an active scheduled election and rejects negative counts", async () => {
    state.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken("admin@example.com"));
    await db
      .update(elections)
      .set({ status: "scheduled", opensAt: new Date(Date.now() - 60000) })
      .where(eq(elections.id, electionId));
    expect(
      await location(
        setManualVoteCountsAction(
          form({ electionId, "manualCount:yes": "3", "manualCount:no": "0" })
        )
      )
    ).toContain("manual_saved=1");
    expect(
      await location(setManualVoteCountsAction(form({ electionId, "manualCount:yes": "-1" })))
    ).toContain("invalid_manual_counts");
    expect(
      (await db.select().from(manualVoteCounts).where(eq(manualVoteCounts.choiceId, "yes")))[0]
        .count
    ).toBe(3);
  });
  it("limits a manager-triggered email dispatch to that election", async () => {
    await db.insert(elections).values({
      communityId: alpha,
      name: "Another election",
      status: "open",
      ballotVersion: "v1",
      ballotJson: ballot
    });
    await dispatchOpenElectionNotifications({ electionId });
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(1);
    expect((await db.select().from(electionNotifications)).map((n) => n.electionId)).toEqual([
      electionId
    ]);
  });
  it("does not notify elections whose closing time has passed", async () => {
    await db
      .update(elections)
      .set({ closesAt: new Date(0) })
      .where(eq(elections.id, electionId));
    await dispatchOpenElectionNotifications();
    expect(sendTemplatedEmail).not.toHaveBeenCalled();
  });
});
