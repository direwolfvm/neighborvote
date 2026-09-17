"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  communities,
  communityMemberships,
  electionEligibility,
  elections,
  members,
  voteSessions,
  votes
} from "@/db/schema";
import { isCommunityMemberEligible } from "@/lib/community";
import { evaluateCommunityRules } from "@/lib/community-rules";
import { ballotSchema } from "@/lib/ballot";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { isVoteUniqueViolation } from "@/lib/db-errors";
import { normalizeEmail } from "@/lib/email";
import { isElectionOpen } from "@/lib/election";
import { sendTemplatedEmail } from "@/lib/mailer";
import { allowEmailRequest } from "@/lib/rate-limit";
import { appBaseUrl } from "@/lib/urls";

const requestLinkSchema = z.object({
  electionId: z.string().uuid(),
  email: z.string().trim().email().max(320),
  returnTo: z.string().optional()
});

export async function requestVoteLinkAction(formData: FormData) {
  try {
    const parsed = requestLinkSchema.safeParse({
      electionId: formData.get("electionId"),
      email: formData.get("email"),
      returnTo: formData.get("returnTo") || undefined
    });

    if (!parsed.success) {
      redirect("/member?error=invalid_input");
    }

    const electionId = parsed.data.electionId;
    const email = normalizeEmail(parsed.data.email);
    if (!(await allowEmailRequest(email))) redirect("/member?error=rate_limited");
    const returnTo = parsed.data.returnTo === "/member" ? "/member" : `/elections/${electionId}`;

    const [election] = await db
      .select({
        id: elections.id,
        name: elections.name,
        communityId: elections.communityId,
        status: elections.status,
        opensAt: elections.opensAt,
        closesAt: elections.closesAt
      })
      .from(elections)
      .where(eq(elections.id, electionId))
      .limit(1);

    if (!election || !isElectionOpen(election)) {
      redirect(`${returnTo}?error=election_not_open`);
    }

    const [member] = await db
      .select({ id: members.id, status: members.status })
      .from(members)
      .where(eq(members.email, email))
      .limit(1);

    if (!member || member.status !== "verified") {
      redirect(`${returnTo}?sent=1`);
    }

    if (!(await isCommunityMemberEligible(election.communityId, member.id, email)))
      redirect(`${returnTo}?sent=1`);

    const [ineligibility] = await db
      .select({ memberId: electionEligibility.memberId })
      .from(electionEligibility)
      .where(
        and(
          eq(electionEligibility.electionId, electionId),
          eq(electionEligibility.memberId, member.id),
          eq(electionEligibility.eligible, false)
        )
      )
      .limit(1);

    if (ineligibility) {
      redirect(`${returnTo}?sent=1`);
    }

    const [existingVote] = await db
      .select({ id: votes.id })
      .from(votes)
      .where(and(eq(votes.electionId, electionId), eq(votes.memberId, member.id)))
      .limit(1);
    if (existingVote) redirect(`${returnTo}?sent=1`);

    const token = generateOpaqueToken();
    const tokenHash = sha256Hex(token);

    const requestHeaders = await headers();
    const ipSource = requestHeaders.get("x-forwarded-for") ?? "unknown";
    const userAgent = requestHeaders.get("user-agent") ?? "unknown";

    const maxExpiry = election.closesAt
      ? Math.min(election.closesAt.getTime(), Date.now() + 1000 * 60 * 60 * 2)
      : Date.now() + 1000 * 60 * 60 * 2;

    await db.insert(voteSessions).values({
      electionId,
      memberId: member.id,
      tokenHash,
      expiresAt: new Date(maxExpiry),
      ipHash: sha256Hex(ipSource),
      userAgentHash: sha256Hex(userAgent)
    });

    const voteUrl = new URL(`/elections/${electionId}`, appBaseUrl());
    voteUrl.searchParams.set("token", token);

    await sendTemplatedEmail(email, "vote-link", voteUrl.toString(), election.name);

    await db.insert(auditEvents).values({
      electionId,
      actor: email,
      action: "vote.link_requested",
      detailsJson: {
        memberId: member.id
      }
    });

    redirect(`${returnTo}?sent=1`);
  } catch (error) {
    unstable_rethrow(error);
    redirect("/member?error=send_failed");
  }
}

const castVoteSchema = z.object({
  electionId: z.string().uuid(),
  token: z.string().min(20).max(200),
  choiceId: z.string().trim().min(1).max(100)
});

export async function castVoteAction(formData: FormData) {
  const parsed = castVoteSchema.safeParse({
    electionId: formData.get("electionId"),
    token: formData.get("token"),
    choiceId: formData.get("choiceId")
  });

  if (!parsed.success) {
    redirect("/member?error=invalid_vote_input");
  }

  const tokenHash = sha256Hex(parsed.data.token);
  const now = new Date();

  let receiptId = "";
  try {
    const result = await db.transaction(async (tx) => {
      const [session] = await tx
        .select({
          sessionId: voteSessions.id,
          electionId: voteSessions.electionId,
          memberId: voteSessions.memberId,
          status: elections.status,
          opensAt: elections.opensAt,
          closesAt: elections.closesAt,
          memberStatus: members.status,
          ballotVersion: elections.ballotVersion,
          ballotJson: elections.ballotJson,
          memberEmail: members.email,
          communityId: elections.communityId
        })
        .from(voteSessions)
        .innerJoin(elections, eq(voteSessions.electionId, elections.id))
        .innerJoin(members, eq(voteSessions.memberId, members.id))
        .where(
          and(
            eq(voteSessions.electionId, parsed.data.electionId),
            eq(voteSessions.tokenHash, tokenHash),
            isNull(voteSessions.usedAt),
            gt(voteSessions.expiresAt, now)
          )
        )
        .limit(1)
        .for("update");

      if (!session || !isElectionOpen(session) || session.memberStatus !== "verified") {
        return { ok: false as const, reason: "invalid_or_expired" };
      }

      const [community] = await tx
        .select()
        .from(communities)
        .where(eq(communities.id, session.communityId))
        .limit(1)
        .for("update");
      const [membership] = await tx
        .select()
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, session.communityId),
            eq(communityMemberships.memberId, session.memberId)
          )
        )
        .limit(1)
        .for("update");
      if (
        !community ||
        !membership ||
        membership.status !== "active" ||
        !evaluateCommunityRules(community.rulesJson, session.memberEmail, membership.answersJson)
          .allowed
      )
        return { ok: false as const, reason: "not_eligible" };
      const ballot = ballotSchema.parse(session.ballotJson);
      const choice = ballot.choices.find((entry) => entry.id === parsed.data.choiceId);
      if (!choice) {
        return { ok: false as const, reason: "invalid_choice" };
      }

      const [ineligibility] = await tx
        .select({ id: electionEligibility.id })
        .from(electionEligibility)
        .where(
          and(
            eq(electionEligibility.electionId, session.electionId),
            eq(electionEligibility.memberId, session.memberId),
            eq(electionEligibility.eligible, false)
          )
        )
        .limit(1);

      if (ineligibility) {
        return { ok: false as const, reason: "not_eligible" };
      }

      const updateSession = await tx
        .update(voteSessions)
        .set({ usedAt: now })
        .where(and(eq(voteSessions.id, session.sessionId), isNull(voteSessions.usedAt)))
        .returning({ id: voteSessions.id });

      if (updateSession.length === 0) {
        return { ok: false as const, reason: "already_used" };
      }

      const [recorded] = await tx
        .insert(votes)
        .values({
          electionId: session.electionId,
          memberId: session.memberId,
          ballotVersion: session.ballotVersion,
          votePayloadJson: {
            choiceId: parsed.data.choiceId,
            choiceLabel: choice.label
          },
          castAt: now
        })
        .returning({ id: votes.id });

      await tx.insert(auditEvents).values({
        electionId: session.electionId,
        actor: session.memberEmail,
        action: "vote.cast",
        detailsJson: {
          memberId: session.memberId,
          ballotVersion: session.ballotVersion
        }
      });

      return { ok: true as const, receiptId: recorded.id };
    });

    if (result.ok) receiptId = result.receiptId;
    if (!result.ok) {
      redirect(`/elections/${parsed.data.electionId}?error=${result.reason}`);
    }
  } catch (error) {
    unstable_rethrow(error);
    if (isVoteUniqueViolation(error)) {
      redirect(`/elections/${parsed.data.electionId}?error=already_voted`);
    }
    redirect(`/elections/${parsed.data.electionId}?error=vote_failed`);
  }

  redirect(`/elections/${parsed.data.electionId}?receipt=${receiptId}`);
}
