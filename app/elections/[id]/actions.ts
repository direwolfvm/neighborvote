"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  electionEligibility,
  elections,
  members,
  voteSessions,
  votes
} from "@/db/schema";
import { ballotSchema } from "@/lib/ballot";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { isVoteUniqueViolation } from "@/lib/db-errors";
import { normalizeEmail } from "@/lib/email";
import { isElectionOpen } from "@/lib/election";
import { sendEmail } from "@/lib/mailer";
import { appBaseUrl } from "@/lib/urls";

const requestLinkSchema = z.object({
  electionId: z.string().uuid(),
  email: z.string().email().max(320)
});

export async function requestVoteLinkAction(formData: FormData) {
  const parsed = requestLinkSchema.safeParse({
    electionId: formData.get("electionId"),
    email: formData.get("email")
  });

  if (!parsed.success) {
    redirect(`/elections/${formData.get("electionId")}?error=invalid_input`);
  }

  const electionId = parsed.data.electionId;
  const email = normalizeEmail(parsed.data.email);

  const [election] = await db
    .select({
      id: elections.id,
      name: elections.name,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt
    })
    .from(elections)
    .where(eq(elections.id, electionId))
    .limit(1);

  if (!election || !isElectionOpen(election)) {
    redirect(`/elections/${electionId}?error=election_not_open`);
  }

  const [member] = await db
    .select({ id: members.id, status: members.status })
    .from(members)
    .where(eq(members.email, email))
    .limit(1);

  if (!member || member.status !== "verified") {
    redirect(`/elections/${electionId}?sent=1`);
  }

  const [eligibility] = await db
    .select({ memberId: electionEligibility.memberId })
    .from(electionEligibility)
    .where(
      and(
        eq(electionEligibility.electionId, electionId),
        eq(electionEligibility.memberId, member.id),
        eq(electionEligibility.eligible, true)
      )
    )
    .limit(1);

  if (!eligibility) {
    redirect(`/elections/${electionId}?sent=1`);
  }

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

  await sendEmail({
    to: email,
    subject: `Your voting link for ${election.name}`,
    text: `Use this one-time link to vote: ${voteUrl.toString()}`
  });

  await db.insert(auditEvents).values({
    electionId,
    actor: email,
    action: "vote.link_requested",
    detailsJson: {
      memberId: member.id
    }
  });

  redirect(`/elections/${electionId}?sent=1`);
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
    redirect(`/elections/${formData.get("electionId")}?error=invalid_vote_input`);
  }

  const tokenHash = sha256Hex(parsed.data.token);
  const now = new Date();

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
          ballotVersion: elections.ballotVersion,
          ballotJson: elections.ballotJson,
          memberEmail: members.email
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
        .limit(1);

      if (!session || !isElectionOpen(session)) {
        return { ok: false as const, reason: "invalid_or_expired" };
      }

      const ballot = ballotSchema.parse(session.ballotJson);
      const choice = ballot.choices.find((entry) => entry.id === parsed.data.choiceId);
      if (!choice) {
        return { ok: false as const, reason: "invalid_choice" };
      }

      const [eligibility] = await tx
        .select({ id: electionEligibility.id })
        .from(electionEligibility)
        .where(
          and(
            eq(electionEligibility.electionId, session.electionId),
            eq(electionEligibility.memberId, session.memberId),
            eq(electionEligibility.eligible, true)
          )
        )
        .limit(1);

      if (!eligibility) {
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

      await tx.insert(votes).values({
        electionId: session.electionId,
        memberId: session.memberId,
        ballotVersion: session.ballotVersion,
        votePayloadJson: {
          choiceId: parsed.data.choiceId,
          choiceLabel: choice.label
        },
        castAt: now
      });

      await tx.insert(auditEvents).values({
        electionId: session.electionId,
        actor: session.memberEmail,
        action: "vote.cast",
        detailsJson: {
          memberId: session.memberId,
          ballotVersion: session.ballotVersion
        }
      });

      return { ok: true as const };
    });

    if (!result.ok) {
      redirect(`/elections/${parsed.data.electionId}?error=${result.reason}`);
    }
  } catch (error) {
    if (isVoteUniqueViolation(error)) {
      redirect(`/elections/${parsed.data.electionId}?error=already_voted`);
    }
    redirect(`/elections/${parsed.data.electionId}?error=vote_failed`);
  }

  redirect(`/elections/${parsed.data.electionId}?success=1`);
}
