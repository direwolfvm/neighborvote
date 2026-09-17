import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { communities, elections, voteSessions, votes } from "@/db/schema";
import { ballotSchema } from "@/lib/ballot";
import { electionStatusLabel, isElectionOpen } from "@/lib/election";
import { sha256Hex } from "@/lib/crypto";
import { BallotForm } from "@/components/ballot-form";
import { Notice } from "@/components/notice";
export default async function ElectionPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const [row] = await db
    .select({
      election: elections,
      community: {
        name: communities.name,
        slug: communities.slug,
        contactEmail: communities.contactEmail
      }
    })
    .from(elections)
    .innerJoin(communities, eq(elections.communityId, communities.id))
    .where(eq(elections.id, id))
    .limit(1);
  if (!row || row.election.status === "draft") notFound();
  const { election, community } = row;
  const ballot = ballotSchema.safeParse(election.ballotJson);
  const token = typeof query.token === "string" && query.token.length <= 200 ? query.token : "";
  const receipt = z.uuid().safeParse(query.receipt);
  const recorded = receipt.success
    ? (
        await db
          .select({ id: votes.id })
          .from(votes)
          .where(and(eq(votes.id, receipt.data), eq(votes.electionId, id)))
          .limit(1)
      ).length > 0
    : false;
  const session = token
    ? (
        await db
          .select({ id: voteSessions.id })
          .from(voteSessions)
          .where(
            and(
              eq(voteSessions.tokenHash, sha256Hex(token)),
              eq(voteSessions.electionId, id),
              isNull(voteSessions.usedAt),
              gt(voteSessions.expiresAt, new Date())
            )
          )
          .limit(1)
      )[0]
    : null;
  const open = isElectionOpen(election);
  const errors: Record<string, string> = {
    election_not_open: "Voting is not currently open.",
    invalid_or_expired:
      "This voting link has expired or already been used. Request a fresh link from your elections page.",
    already_voted: "You have already submitted a vote in this election.",
    invalid_choice: "That selection is not on this ballot. Request a fresh link to try again.",
    not_eligible:
      "Your current membership does not qualify for this election. Contact your community manager.",
    already_used: "This voting link has already been used.",
    vote_failed: "We couldn’t confirm your vote. Check your elections page before trying again."
  };
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <Link className="text-sm text-emerald-800 underline" href={`/communities/${community.slug}`}>
        ← {community.name}
      </Link>
      <div className="space-y-4">
        <p className="eyebrow">{electionStatusLabel(election)}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{election.name}</h1>
        {election.description && (
          <p className="leading-relaxed text-slate-600">{election.description}</p>
        )}
        {election.closesAt && (
          <p className="text-sm text-slate-600">
            Voting closes{" "}
            {election.closesAt.toLocaleString("en-US", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "UTC"
            })}{" "}
            UTC
          </p>
        )}
      </div>
      {recorded ? (
        <div className="card space-y-5">
          <p className="eyebrow">You’ve had your say</p>
          <h2 className="text-3xl font-semibold">Your vote is recorded.</h2>
          <p className="leading-relaxed text-slate-600">
            Thank you for taking part in your community’s decision. You don’t need to do anything
            else.
          </p>
          <Link className="btn" href="/member">
            Back to my elections
          </Link>
        </div>
      ) : (
        <>
          {typeof query.error === "string" && (
            <Notice error>
              {errors[query.error] || "We couldn’t complete that request. Please try again."}
            </Notice>
          )}
          {open && session && ballot.success ? (
            <div className="card">
              <BallotForm electionId={id} token={token} ballot={ballot.data} />
            </div>
          ) : (
            <div className="card space-y-4">
              <h2 className="text-xl font-semibold">
                {token && !session
                  ? "Let’s get you a fresh link."
                  : open
                    ? "Ready to have your say?"
                    : "Your community’s decision."}
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">
                {token && !session
                  ? "This link has expired or has already been used. Sign in to check whether your vote was recorded or request a new ballot."
                  : open
                    ? "Sign in to your member account and request your private ballot. New here? Join the community first."
                    : "Sign in to see your participation. Ballots are available while voting is open."}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link className="btn" href="/member">
                  Go to my elections
                </Link>
                <Link className="btn-secondary" href={`/register?community=${community.slug}`}>
                  Join this community
                </Link>
              </div>
            </div>
          )}
        </>
      )}
      {community.contactEmail && (
        <a
          className="inline-block text-sm text-emerald-800 underline"
          href={`mailto:${community.contactEmail}`}
        >
          Get help from your community manager
        </a>
      )}
    </section>
  );
}
