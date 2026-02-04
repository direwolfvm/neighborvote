import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/db/client";
import { electionEligibility, elections, voteSessions, votes } from "@/db/schema";
import { requestVoteLinkAction } from "@/app/elections/[id]/actions";
import { memberLogoutAction } from "@/app/member/login/actions";
import { getMemberFromSession } from "@/lib/member-auth";
import { isElectionOpen } from "@/lib/election";

export default async function MemberHomePage() {
  const member = await getMemberFromSession();

  if (!member) {
    return (
      <section className="card space-y-4">
        <h1 className="text-2xl font-semibold">Member Portal</h1>
        <p className="text-sm text-slate-700">Please sign in to view your elections.</p>
        <Link className="btn" href="/member/login">
          Member Login
        </Link>
      </section>
    );
  }

  const electionRows = await db
    .select({
      id: elections.id,
      name: elections.name,
      description: elections.description,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt,
      ballotVersion: elections.ballotVersion,
      votePayloadJson: votes.votePayloadJson,
      castAt: votes.castAt,
      lastVoteLinkSent: sql<Date | null>`(\n        select max(${voteSessions.issuedAt})\n        from ${voteSessions}\n        where ${voteSessions.electionId} = ${elections.id}\n          and ${voteSessions.memberId} = ${member.id}\n      )`
    })
    .from(elections)
    .leftJoin(votes, and(eq(votes.electionId, elections.id), eq(votes.memberId, member.id)))
    .leftJoin(
      electionEligibility,
      and(eq(electionEligibility.electionId, elections.id), eq(electionEligibility.memberId, member.id))
    )
    .where(
      and(
        sql`${elections.status} <> 'draft'`,
        isNull(electionEligibility.id).or(eq(electionEligibility.eligible, true))
      )
    )
    .orderBy(desc(elections.opensAt));

  return (
    <section className="space-y-4">
      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Welcome, {member.fullName}</h1>
          <form action={memberLogoutAction}>
            <button type="submit" className="btn-secondary">
              Log out
            </button>
          </form>
        </div>
        <p className="text-sm text-slate-700">Signed in as {member.email}</p>
      </div>

      {electionRows.length === 0 ? (
        <div className="card">
          <p className="text-sm text-slate-700">No elections available yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {electionRows.map((election) => {
            const open = isElectionOpen(election);
            const scheduled = election.status === "scheduled" || (!open && election.status === "open");
            const closed = election.status === "closed" || election.status === "archived";
            const hasVoted = Boolean(election.castAt);

            return (
              <div key={election.id} className="card space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{election.name}</h2>
                    {election.description ? (
                      <p className="text-sm text-slate-700">{election.description}</p>
                    ) : null}
                  </div>
                  <span className="text-xs text-slate-500">
                    {open ? "Open" : scheduled ? "Scheduled" : closed ? "Complete" : election.status}
                  </span>
                </div>

                {open ? (
                  <div className="space-y-2">
                    {hasVoted ? (
                      <p className="text-sm text-emerald-700">Vote submitted on {election.castAt?.toISOString()}.</p>
                    ) : null}
                    {election.lastVoteLinkSent && !hasVoted ? (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-600">
                          Last voting link sent {election.lastVoteLinkSent.toISOString()}
                        </p>
                        <form action={requestVoteLinkAction} className="space-y-2">
                          <input type="hidden" name="electionId" value={election.id} />
                          <input type="hidden" name="email" value={member.email} />
                          <input type="hidden" name="returnTo" value="/member" />
                          <SubmitButton idleText="Resend link" pendingText="Resending..." className="btn-secondary" />
                        </form>
                      </div>
                    ) : null}
                    {!election.lastVoteLinkSent && !hasVoted ? (
                      <form action={requestVoteLinkAction} className="space-y-2">
                        <input type="hidden" name="electionId" value={election.id} />
                        <input type="hidden" name="email" value={member.email} />
                        <input type="hidden" name="returnTo" value="/member" />
                        <SubmitButton idleText="Email me a voting link" pendingText="Sending..." />
                      </form>
                    ) : null}
                  </div>
                ) : null}

                {!open && scheduled ? (
                  <p className="text-sm text-slate-600">
                    Scheduled to open {election.opensAt ? election.opensAt.toISOString() : "soon"}.
                  </p>
                ) : null}

                {closed ? (
                  <div className="text-sm text-slate-700">
                    {hasVoted ? (
                      <div>
                        <p className="font-medium">Your vote:</p>
                        <pre className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
{JSON.stringify(election.votePayloadJson, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <p>No vote recorded.</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <p className="text-sm text-slate-700">
          Need help? <Link className="underline" href="/register">Register or verify</Link> if you haven't already.
        </p>
      </div>
    </section>
  );
}
